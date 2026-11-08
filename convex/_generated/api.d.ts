/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ResendOTP from "../ResendOTP.js";
import type * as ResendOTPPasswordReset from "../ResendOTPPasswordReset.js";
import type * as allowedEmails from "../allowedEmails.js";
import type * as auth from "../auth.js";
import type * as authHelpers from "../authHelpers.js";
import type * as calls from "../calls.js";
import type * as capsules from "../capsules.js";
import type * as chatAnalysis from "../chatAnalysis.js";
import type * as chatLexicon from "../chatLexicon.js";
import type * as crons from "../crons.js";
import type * as dataExport from "../dataExport.js";
import type * as emailTemplate from "../emailTemplate.js";
import type * as expenses from "../expenses.js";
import type * as fights from "../fights.js";
import type * as files from "../files.js";
import type * as goals from "../goals.js";
import type * as health_abdm from "../health/abdm.js";
import type * as health_access from "../health/access.js";
import type * as health_care from "../health/care.js";
import type * as health_cycle from "../health/cycle.js";
import type * as health_cycleLogic from "../health/cycleLogic.js";
import type * as health_extract from "../health/extract.js";
import type * as health_fhir from "../health/fhir.js";
import type * as health_fhirImport from "../health/fhirImport.js";
import type * as health_history from "../health/history.js";
import type * as health_insurance from "../health/insurance.js";
import type * as health_interactions from "../health/interactions.js";
import type * as health_labLogic from "../health/labLogic.js";
import type * as health_labs from "../health/labs.js";
import type * as health_meds from "../health/meds.js";
import type * as health_mind from "../health/mind.js";
import type * as health_mindQuestions from "../health/mindQuestions.js";
import type * as health_prevention from "../health/prevention.js";
import type * as health_preventionLogic from "../health/preventionLogic.js";
import type * as health_profile from "../health/profile.js";
import type * as health_records from "../health/records.js";
import type * as health_reminders from "../health/reminders.js";
import type * as health_schedule from "../health/schedule.js";
import type * as health_sharePage from "../health/sharePage.js";
import type * as health_sharing from "../health/sharing.js";
import type * as health_summary from "../health/summary.js";
import type * as health_symptoms from "../health/symptoms.js";
import type * as health_time from "../health/time.js";
import type * as health_validators from "../health/validators.js";
import type * as health_visits from "../health/visits.js";
import type * as health_vitals from "../health/vitals.js";
import type * as http from "../http.js";
import type * as insights from "../insights.js";
import type * as liveLocations from "../liveLocations.js";
import type * as memories from "../memories.js";
import type * as messages from "../messages.js";
import type * as notifications from "../notifications.js";
import type * as notify from "../notify.js";
import type * as push from "../push.js";
import type * as pushSubscriptions from "../pushSubscriptions.js";
import type * as recurring from "../recurring.js";
import type * as relationshipAnalyzer from "../relationshipAnalyzer.js";
import type * as scheduled from "../scheduled.js";
import type * as settings from "../settings.js";
import type * as splitImport from "../splitImport.js";
import type * as tracking from "../tracking.js";
import type * as users from "../users.js";
import type * as widgets from "../widgets.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ResendOTP: typeof ResendOTP;
  ResendOTPPasswordReset: typeof ResendOTPPasswordReset;
  allowedEmails: typeof allowedEmails;
  auth: typeof auth;
  authHelpers: typeof authHelpers;
  calls: typeof calls;
  capsules: typeof capsules;
  chatAnalysis: typeof chatAnalysis;
  chatLexicon: typeof chatLexicon;
  crons: typeof crons;
  dataExport: typeof dataExport;
  emailTemplate: typeof emailTemplate;
  expenses: typeof expenses;
  fights: typeof fights;
  files: typeof files;
  goals: typeof goals;
  "health/abdm": typeof health_abdm;
  "health/access": typeof health_access;
  "health/care": typeof health_care;
  "health/cycle": typeof health_cycle;
  "health/cycleLogic": typeof health_cycleLogic;
  "health/extract": typeof health_extract;
  "health/fhir": typeof health_fhir;
  "health/fhirImport": typeof health_fhirImport;
  "health/history": typeof health_history;
  "health/insurance": typeof health_insurance;
  "health/interactions": typeof health_interactions;
  "health/labLogic": typeof health_labLogic;
  "health/labs": typeof health_labs;
  "health/meds": typeof health_meds;
  "health/mind": typeof health_mind;
  "health/mindQuestions": typeof health_mindQuestions;
  "health/prevention": typeof health_prevention;
  "health/preventionLogic": typeof health_preventionLogic;
  "health/profile": typeof health_profile;
  "health/records": typeof health_records;
  "health/reminders": typeof health_reminders;
  "health/schedule": typeof health_schedule;
  "health/sharePage": typeof health_sharePage;
  "health/sharing": typeof health_sharing;
  "health/summary": typeof health_summary;
  "health/symptoms": typeof health_symptoms;
  "health/time": typeof health_time;
  "health/validators": typeof health_validators;
  "health/visits": typeof health_visits;
  "health/vitals": typeof health_vitals;
  http: typeof http;
  insights: typeof insights;
  liveLocations: typeof liveLocations;
  memories: typeof memories;
  messages: typeof messages;
  notifications: typeof notifications;
  notify: typeof notify;
  push: typeof push;
  pushSubscriptions: typeof pushSubscriptions;
  recurring: typeof recurring;
  relationshipAnalyzer: typeof relationshipAnalyzer;
  scheduled: typeof scheduled;
  settings: typeof settings;
  splitImport: typeof splitImport;
  tracking: typeof tracking;
  users: typeof users;
  widgets: typeof widgets;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
