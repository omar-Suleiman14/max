export type MapPoint = Readonly<{
  latitude: number;
  longitude: number;
}>;

export type MapProviderStatus = Readonly<{
  configured: boolean;
  disclosure: string;
  providerName: string;
}>;

export type MapRenderResult = Readonly<{
  imageDataUrl: string;
  providerName: string;
}>;
