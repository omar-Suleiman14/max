declare const __MAX_PREVIEW_TOKEN__: string;
export const contextBridge = { exposeInMainWorld: (key: string, value: unknown) => { Object.defineProperty(window, key, { value, configurable: true }); } };
export const ipcRenderer = {
  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    // Electron's IPC clones a Uint8Array as itself; JSON would turn image bytes
    // into an object keyed by index, so send them as a plain array instead.
    const wire = args.map((value) => (value instanceof Uint8Array ? [...value] : value));
    const response = await fetch('/__max/invoke', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Max-Preview': __MAX_PREVIEW_TOKEN__ }, body: JSON.stringify({ channel, args: wire }) });
    const result = await response.json() as { error?: string; value?: unknown };
    if (!response.ok) throw new Error(result.error ?? 'Local preview request failed.');
    return result.value;
  },
};
