/**
 * Messages per chat page. Shared by ChatView and App's idle prefetch, whose
 * query args must match exactly for the prefetched page to be reused. Lives
 * here rather than in ChatView so importing it doesn't pull the whole chat
 * screen into the initial bundle.
 */
export const CHAT_PAGE = 200;
