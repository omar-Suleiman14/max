declare const __MAX_PREVIEW_TOKEN__: string;
export const contextBridge = { exposeInMainWorld: (key: string, value: unknown) => { Object.defineProperty(window, key, { value, configurable: true }); } };
export const ipcRenderer = {
  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const response = await fetch('/__max/invoke', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Max-Preview': __MAX_PREVIEW_TOKEN__ }, body: JSON.stringify({ channel, args }) });
    const result = await response.json() as { error?: string; value?: unknown };
    if (!response.ok) throw new Error(result.error ?? 'Local preview request failed.');
    return result.value;
  },
};
