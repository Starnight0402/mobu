package com.mobu.app

import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.units.BloodGlucose
import androidx.health.connect.client.units.Length
import androidx.health.connect.client.units.Mass
import androidx.health.connect.client.units.Percentage
import androidx.health.connect.client.units.Pressure
import androidx.health.connect.client.units.Temperature
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.Period
import java.time.ZoneId
import java.time.ZoneOffset
import kotlin.reflect.KClass

/**
 * Bridge between Android Health Connect and the web app (src/lib/healthConnect.ts).
 *
 * Reads are mapped to Mobu's own reading types and returned as plain JSON, so
 * the web side only has to upsert them. Daily totals (steps, distance, active
 * calories, water, average heart rate) use Health Connect's aggregation, which
 * de-duplicates the watch and the phone counting the same walk. Records that
 * Mobu itself wrote are skipped on the way back in.
 */
@CapacitorPlugin(name = "MobuHealthConnect")
class MobuHealthConnectPlugin : Plugin() {

    private val scope = CoroutineScope(Dispatchers.IO)
    private val zone: ZoneId get() = ZoneId.systemDefault()

    private val READ_CORE: List<KClass<out Record>> = listOf(
        StepsRecord::class, DistanceRecord::class, ActiveCaloriesBurnedRecord::class, HydrationRecord::class,
        HeartRateRecord::class, RestingHeartRateRecord::class, HeartRateVariabilityRmssdRecord::class,
        OxygenSaturationRecord::class, RespiratoryRateRecord::class, BodyTemperatureRecord::class,
        BloodPressureRecord::class, BloodGlucoseRecord::class, WeightRecord::class, HeightRecord::class,
        BodyFatRecord::class, Vo2MaxRecord::class, SleepSessionRecord::class, ExerciseSessionRecord::class,
    )
    private val READ_CYCLE: List<KClass<out Record>> = listOf(
        MenstruationPeriodRecord::class, MenstruationFlowRecord::class, BasalBodyTemperatureRecord::class,
        OvulationTestRecord::class, CervicalMucusRecord::class, SexualActivityRecord::class, IntermenstrualBleedingRecord::class,
    )
    private val WRITE: List<KClass<out Record>> = listOf(
        BloodPressureRecord::class, BloodGlucoseRecord::class, WeightRecord::class, BodyTemperatureRecord::class,
        OxygenSaturationRecord::class, HeightRecord::class, BodyFatRecord::class,
    )
    private val HISTORY = "android.permission.health.READ_HEALTH_DATA_HISTORY"

    private fun wanted(cycle: Boolean, write: Boolean): Pair<Set<String>, Set<String>> {
        val read = (READ_CORE + if (cycle) READ_CYCLE else emptyList()).map { HealthPermission.getReadPermission(it) }.toSet()
        val wr = if (write) WRITE.map { HealthPermission.getWritePermission(it) }.toSet() else emptySet()
        return read to wr
    }

    private fun client(): HealthConnectClient = HealthConnectClient.getOrCreate(context)

    private fun summary(granted: Set<String>, cycle: Boolean, write: Boolean): JSObject {
        val (read, wr) = wanted(cycle, write)
        return JSObject().apply {
            put("read", read.count { it in granted })
            put("total", read.size)
            put("write", wr.count { it in granted })
            put("history", HISTORY in granted)
        }
    }

    @PluginMethod
    fun availability(call: PluginCall) {
        val status = when (HealthConnectClient.getSdkStatus(context)) {
            HealthConnectClient.SDK_AVAILABLE -> "available"
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update"
            else -> "unavailable"
        }
        call.resolve(JSObject().put("status", status))
    }

    @PluginMethod
    fun granted(call: PluginCall) {
        val cycle = call.getBoolean("cycle", false) == true
        val write = call.getBoolean("write", false) == true
        scope.launch {
            try {
                call.resolve(summary(client().permissionController.getGrantedPermissions(), cycle, write))
            } catch (e: Exception) {
                call.reject(e.message ?: "Health Connect isn't available")
            }
        }
    }

    @PluginMethod
    fun askPermissions(call: PluginCall) {
        val cycle = call.getBoolean("cycle", false) == true
        val write = call.getBoolean("write", false) == true
        try {
            val (read, wr) = wanted(cycle, write)
            val intent = PermissionController.createRequestPermissionResultContract().createIntent(context, read + wr + HISTORY)
            call.data.put("_cycle", cycle)
            call.data.put("_write", write)
            startActivityForResult(call, intent, "permissionsResult")
        } catch (e: Exception) {
            call.reject(e.message ?: "Couldn't open Health Connect")
        }
    }

    @ActivityCallback
    private fun permissionsResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val cycle = call.getBoolean("_cycle", false) == true
        val write = call.getBoolean("_write", false) == true
        val granted = PermissionController.createRequestPermissionResultContract().parseResult(result.resultCode, result.data)
        call.resolve(summary(granted, cycle, write))
    }

    @PluginMethod
    fun openSettings(call: PluginCall) {
        try {
            HealthConnectClient.getHealthConnectManageDataIntent(context).let {
                it.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(it)
            }
            call.resolve()
        } catch (e: Exception) {
            call.reject(e.message ?: "Couldn't open Health Connect")
        }
    }

    /* ---------------- reading ---------------- */

    private suspend fun <T : Record> all(c: HealthConnectClient, type: KClass<T>, from: Instant, to: Instant): List<T> {
        val out = mutableListOf<T>()
        var token: String? = null
        do {
            val res = c.readRecords(ReadRecordsRequest(type, TimeRangeFilter.between(from, to), pageSize = 1000, pageToken = token))
            out += res.records.filter { it.metadata.dataOrigin.packageName != context.packageName }
            token = res.pageToken?.takeIf { it.isNotEmpty() }
        } while (token != null && out.size < 20_000)
        return out
    }

    private fun vital(hcId: String, type: String, time: Instant, value: Double, source: String, value2: Double? = null, context: String? = null, extra: JSObject? = null) =
        JSObject().apply {
            put("hcId", hcId)
            put("type", type)
            put("time", time.toEpochMilli())
            put("value", value)
            if (value2 != null) put("value2", value2)
            if (context != null) put("context", context)
            put("source", source)
            if (extra != null) put("extra", extra)
        }

    private fun src(r: Record) = appName(r.metadata.dataOrigin.packageName)

    private fun appName(pkg: String): String = try {
        val pm = context.packageManager
        pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
    } catch (e: Exception) {
        pkg
    }

    private fun day(d: LocalDate) = d.toString()

    @PluginMethod
    fun read(call: PluginCall) {
        val since = Instant.ofEpochMilli(call.getLong("since") ?: (System.currentTimeMillis() - 7 * 86_400_000L))
        val until = Instant.ofEpochMilli(call.getLong("until") ?: System.currentTimeMillis())
        val cycle = call.getBoolean("cycle", false) == true
        scope.launch {
            try {
                val c = client()
                val granted = c.permissionController.getGrantedPermissions()
                fun ok(t: KClass<out Record>) = HealthPermission.getReadPermission(t) in granted
                val vitals = JSArray()
                suspend fun <T : Record> each(t: KClass<T>, f: (T) -> Unit) {
                    if (ok(t)) all(c, t, since, until).forEach(f)
                }

                each(BloodPressureRecord::class) {
                    vitals.put(vital(it.metadata.id, "bp", it.time, it.systolic.inMillimetersOfMercury, src(it), it.diastolic.inMillimetersOfMercury))
                }
                each(RestingHeartRateRecord::class) { vitals.put(vital(it.metadata.id, "restingHr", it.time, it.beatsPerMinute.toDouble(), src(it))) }
                each(HeartRateVariabilityRmssdRecord::class) { vitals.put(vital(it.metadata.id, "hrv", it.time, it.heartRateVariabilityMillis, src(it))) }
                each(OxygenSaturationRecord::class) { vitals.put(vital(it.metadata.id, "spo2", it.time, it.percentage.value, src(it))) }
                each(RespiratoryRateRecord::class) { vitals.put(vital(it.metadata.id, "respRate", it.time, it.rate, src(it))) }
                each(BodyTemperatureRecord::class) { vitals.put(vital(it.metadata.id, "temp", it.time, it.temperature.inCelsius, src(it))) }
                each(WeightRecord::class) { vitals.put(vital(it.metadata.id, "weight", it.time, it.weight.inKilograms, src(it))) }
                each(HeightRecord::class) { vitals.put(vital(it.metadata.id, "height", it.time, it.height.inMeters * 100, src(it))) }
                each(BodyFatRecord::class) { vitals.put(vital(it.metadata.id, "bodyFat", it.time, it.percentage.value, src(it))) }
                each(Vo2MaxRecord::class) { vitals.put(vital(it.metadata.id, "vo2max", it.time, it.vo2MillilitersPerMinuteKilogram, src(it))) }
                each(BloodGlucoseRecord::class) {
                    val ctx = when (it.relationToMeal) {
                        BloodGlucoseRecord.RELATION_TO_MEAL_FASTING -> "Fasting"
                        BloodGlucoseRecord.RELATION_TO_MEAL_BEFORE_MEAL -> "Before a meal"
                        BloodGlucoseRecord.RELATION_TO_MEAL_AFTER_MEAL -> "After a meal"
                        else -> null
                    }
                    vitals.put(vital(it.metadata.id, "glucose", it.time, it.level.inMilligramsPerDeciliter, src(it), context = ctx))
                }

                // Sleep, with stages. Awake time inside the night doesn't count as sleep.
                val activeMinutes = HashMap<LocalDate, Double>()
                each(SleepSessionRecord::class) { s ->
                    val stages = JSArray()
                    var asleepMin = 0.0
                    for (st in s.stages) {
                        val min = (st.endTime.epochSecond - st.startTime.epochSecond) / 60.0
                        val name = when (st.stage) {
                            SleepSessionRecord.STAGE_TYPE_DEEP -> "deep"
                            SleepSessionRecord.STAGE_TYPE_LIGHT -> "light"
                            SleepSessionRecord.STAGE_TYPE_REM -> "rem"
                            SleepSessionRecord.STAGE_TYPE_SLEEPING -> "sleeping"
                            SleepSessionRecord.STAGE_TYPE_OUT_OF_BED -> "out_of_bed"
                            SleepSessionRecord.STAGE_TYPE_AWAKE, SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED -> "awake"
                            else -> "unknown"
                        }
                        if (name != "awake" && name != "out_of_bed" && name != "unknown") asleepMin += min
                        if (stages.length() < 120) stages.put(JSObject().put("stage", name).put("min", Math.round(min * 10) / 10.0))
                    }
                    val total = if (s.stages.isEmpty()) (s.endTime.epochSecond - s.startTime.epochSecond) / 60.0 else asleepMin
                    if (total >= 20) {
                        val extra = JSObject().put("endTime", s.endTime.toEpochMilli())
                        if (stages.length() > 0) extra.put("stages", stages)
                        vitals.put(vital(s.metadata.id, "sleep", s.startTime, Math.round(total / 6.0) / 10.0, src(s), extra = extra))
                    }
                }

                each(ExerciseSessionRecord::class) { e ->
                    val min = (e.endTime.epochSecond - e.startTime.epochSecond) / 60.0
                    if (min < 1) return@each
                    val kind = (ExerciseSessionRecord.EXERCISE_TYPE_INT_TO_STRING_MAP[e.exerciseType] ?: "workout").replace('_', ' ')
                    val extra = JSObject().put("exerciseType", kind).put("endTime", e.endTime.toEpochMilli())
                    e.title?.let { extra.put("title", it) } ?: extra.put("title", kind.replaceFirstChar { ch -> ch.uppercase() })
                    vitals.put(vital(e.metadata.id, "exercise", e.startTime, Math.round(min).toDouble(), src(e), extra = extra))
                    val d = e.startTime.atZone(zone).toLocalDate()
                    activeMinutes[d] = (activeMinutes[d] ?: 0.0) + min
                }

                // Daily totals through aggregation (no double counting between devices).
                val metrics = mutableSetOf<androidx.health.connect.client.aggregate.AggregateMetric<*>>()
                if (ok(StepsRecord::class)) metrics += StepsRecord.COUNT_TOTAL
                if (ok(DistanceRecord::class)) metrics += DistanceRecord.DISTANCE_TOTAL
                if (ok(ActiveCaloriesBurnedRecord::class)) metrics += ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL
                if (ok(HydrationRecord::class)) metrics += HydrationRecord.VOLUME_TOTAL
                if (ok(HeartRateRecord::class)) metrics += HeartRateRecord.BPM_AVG
                if (metrics.isNotEmpty()) {
                    val start = since.atZone(zone).toLocalDate().atStartOfDay()
                    val end = LocalDateTime.now(zone).plusDays(1).toLocalDate().atStartOfDay()
                    val days = c.aggregateGroupByPeriod(AggregateGroupByPeriodRequest(metrics, TimeRangeFilter.between(start, end), Period.ofDays(1)))
                    for (d in days) {
                        val date = d.startTime.toLocalDate()
                        val noon = date.atTime(12, 0).atZone(zone).toInstant()
                        val r = d.result
                        r[StepsRecord.COUNT_TOTAL]?.takeIf { it > 0 }?.let { vitals.put(vital("day:steps:${day(date)}", "steps", noon, it.toDouble(), "Health Connect")) }
                        r[DistanceRecord.DISTANCE_TOTAL]?.inKilometers?.takeIf { it > 0 }?.let { vitals.put(vital("day:distance:${day(date)}", "distance", noon, Math.round(it * 100) / 100.0, "Health Connect")) }
                        r[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories?.takeIf { it > 0 }?.let { vitals.put(vital("day:calories:${day(date)}", "calories", noon, Math.round(it).toDouble(), "Health Connect")) }
                        r[HydrationRecord.VOLUME_TOTAL]?.inLiters?.takeIf { it > 0 }?.let { vitals.put(vital("day:water:${day(date)}", "water", noon, Math.round(it * 100) / 100.0, "Health Connect")) }
                        r[HeartRateRecord.BPM_AVG]?.let { vitals.put(vital("day:heartRate:${day(date)}", "heartRate", noon, it.toDouble(), "Health Connect", context = "Daily average")) }
                        activeMinutes[date]?.let { vitals.put(vital("day:activeMinutes:${day(date)}", "activeMinutes", noon, Math.round(it).toDouble(), "Health Connect")) }
                    }
                }

                val cycleDays = JSArray()
                if (cycle) {
                    val byDate = LinkedHashMap<String, JSObject>()
                    fun entry(d: LocalDate) = byDate.getOrPut(day(d)) { JSObject().put("date", day(d)) }
                    fun rank(f: String?) = listOf("none", "spotting", "light", "medium", "heavy").indexOf(f)
                    fun setFlow(d: LocalDate, f: String) {
                        val e = entry(d)
                        if (rank(f) > rank(e.optString("flow", null))) e.put("flow", f)
                    }
                    each(MenstruationPeriodRecord::class) { p ->
                        var d = p.startTime.atZone(zone).toLocalDate()
                        val last = p.endTime.atZone(zone).toLocalDate()
                        while (!d.isAfter(last)) { setFlow(d, "light"); d = d.plusDays(1) }
                    }
                    each(MenstruationFlowRecord::class) {
                        val f = when (it.flow) { MenstruationFlowRecord.FLOW_LIGHT -> "light"; MenstruationFlowRecord.FLOW_MEDIUM -> "medium"; MenstruationFlowRecord.FLOW_HEAVY -> "heavy"; else -> "light" }
                        setFlow(it.time.atZone(zone).toLocalDate(), f)
                    }
                    each(IntermenstrualBleedingRecord::class) { setFlow(it.time.atZone(zone).toLocalDate(), "spotting") }
                    each(BasalBodyTemperatureRecord::class) { entry(it.time.atZone(zone).toLocalDate()).put("bbt", Math.round(it.temperature.inCelsius * 100) / 100.0) }
                    each(OvulationTestRecord::class) {
                        val r = when (it.result) { OvulationTestRecord.RESULT_POSITIVE -> "positive"; OvulationTestRecord.RESULT_HIGH -> "high"; OvulationTestRecord.RESULT_NEGATIVE -> "negative"; else -> "inconclusive" }
                        entry(it.time.atZone(zone).toLocalDate()).put("ovulationTest", r)
                    }
                    each(CervicalMucusRecord::class) {
                        val m = when (it.appearance) { CervicalMucusRecord.APPEARANCE_DRY -> "dry"; CervicalMucusRecord.APPEARANCE_STICKY -> "sticky"; CervicalMucusRecord.APPEARANCE_CREAMY -> "creamy"; CervicalMucusRecord.APPEARANCE_WATERY -> "watery"; CervicalMucusRecord.APPEARANCE_EGG_WHITE -> "eggwhite"; else -> null }
                        if (m != null) entry(it.time.atZone(zone).toLocalDate()).put("mucus", m)
                    }
                    each(SexualActivityRecord::class) {
                        val m = if (it.protectionUsed == SexualActivityRecord.PROTECTION_USED_PROTECTED) "protected" else "unprotected"
                        entry(it.time.atZone(zone).toLocalDate()).put("intimacy", m)
                    }
                    byDate.values.forEach { cycleDays.put(it) }
                }

                call.resolve(JSObject().put("vitals", vitals).put("cycle", cycleDays))
            } catch (e: Exception) {
                call.reject(e.message ?: "Couldn't read Health Connect")
            }
        }
    }

    /* ---------------- writing ---------------- */

    @PluginMethod
    fun write(call: PluginCall) {
        val arr = call.getArray("records") ?: JSArray()
        scope.launch {
            try {
                val c = client()
                val granted = c.permissionController.getGrantedPermissions()
                val list = mutableListOf<Record>()
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    val t = Instant.ofEpochMilli(o.getLong("time"))
                    val zo: ZoneOffset = zone.rules.getOffset(t)
                    val v = o.getDouble("value")
                    val meta = Metadata.manualEntry()
                    fun can(k: KClass<out Record>) = HealthPermission.getWritePermission(k) in granted
                    when (o.getString("type")) {
                        "bp" -> if (can(BloodPressureRecord::class) && o.has("value2")) list += BloodPressureRecord(time = t, zoneOffset = zo, systolic = Pressure.millimetersOfMercury(v), diastolic = Pressure.millimetersOfMercury(o.getDouble("value2")), metadata = meta)
                        "glucose" -> if (can(BloodGlucoseRecord::class)) list += BloodGlucoseRecord(time = t, zoneOffset = zo, level = BloodGlucose.milligramsPerDeciliter(v), metadata = meta)
                        "weight" -> if (can(WeightRecord::class)) list += WeightRecord(time = t, zoneOffset = zo, weight = Mass.kilograms(v), metadata = meta)
                        "temp" -> if (can(BodyTemperatureRecord::class)) list += BodyTemperatureRecord(time = t, zoneOffset = zo, temperature = Temperature.celsius(v), metadata = meta)
                        "spo2" -> if (can(OxygenSaturationRecord::class)) list += OxygenSaturationRecord(time = t, zoneOffset = zo, percentage = Percentage(v), metadata = meta)
                        "height" -> if (can(HeightRecord::class)) list += HeightRecord(time = t, zoneOffset = zo, height = Length.meters(v / 100.0), metadata = meta)
                        "bodyFat" -> if (can(BodyFatRecord::class)) list += BodyFatRecord(time = t, zoneOffset = zo, percentage = Percentage(v), metadata = meta)
                    }
                }
                if (list.isNotEmpty()) c.insertRecords(list)
                call.resolve(JSObject().put("written", list.size))
            } catch (e: Exception) {
                call.reject(e.message ?: "Couldn't write to Health Connect")
            }
        }
    }
}
