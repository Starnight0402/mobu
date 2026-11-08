import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { sharePage } from "./health/sharePage";

const http = httpRouter();

auth.addHttpRoutes(http);

// Public, view-only health pages (doctor links, the Medical ID QR code). The
// unguessable token in the query string is the only key; see health/sharing.ts.
http.route({ path: "/health/share", method: "GET", handler: sharePage });

export default http;
