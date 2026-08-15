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
import type * as crons from "../crons.js";
import type * as dataExport from "../dataExport.js";
import type * as emailTemplate from "../emailTemplate.js";
import type * as expenses from "../expenses.js";
import type * as fights from "../fights.js";
import type * as files from "../files.js";
import type * as goals from "../goals.js";
import type * as http from "../http.js";
import type * as insights from "../insights.js";
import type * as liveLocations from "../liveLocations.js";
import type * as memories from "../memories.js";
import type * as messages from "../messages.js";
import type * as notifications from "../notifications.js";
import type * as notify from "../notify.js";
import type * as push from "../push.js";
import type * as pushSubscriptions from "../pushSubscriptions.js";
import type * as relationshipAnalyzer from "../relationshipAnalyzer.js";
import type * as scheduled from "../scheduled.js";
import type * as settings from "../settings.js";
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
  crons: typeof crons;
  dataExport: typeof dataExport;
  emailTemplate: typeof emailTemplate;
  expenses: typeof expenses;
  fights: typeof fights;
  files: typeof files;
  goals: typeof goals;
  http: typeof http;
  insights: typeof insights;
  liveLocations: typeof liveLocations;
  memories: typeof memories;
  messages: typeof messages;
  notifications: typeof notifications;
  notify: typeof notify;
  push: typeof push;
  pushSubscriptions: typeof pushSubscriptions;
  relationshipAnalyzer: typeof relationshipAnalyzer;
  scheduled: typeof scheduled;
  settings: typeof settings;
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
