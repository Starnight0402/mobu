export function useNotifications() {
  return { unreadByTab: { chat: 2 }, unreadTotal: 3, permission: 'granted', deviceRegistered: true, enable: async () => null, disable: async () => {}, markTabRead() {}, toast() {} };
}
