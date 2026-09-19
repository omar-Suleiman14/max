/** The desktop uses a native Save dialog; the disposable browser preview downloads. */
export async function exportWorkspaceImage(url: string): Promise<boolean> {
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    const response = await fetch(url.replace('max://asset/', '/__max/asset/'));
    if (!response.ok) throw new Error('Could not read the image.');
    const address = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = address; link.download = `Max-image.${url.split('.').at(-1) ?? 'jpg'}`;
    link.click(); setTimeout(() => URL.revokeObjectURL(address), 1000);
    return true;
  }
  const result = await window.maxApi.assets.exportImage(url);
  if (!result.ok) throw new Error(result.error.message);
  return !result.value.canceled;
}
