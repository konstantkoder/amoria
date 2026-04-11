import type { RoomMessage } from "@/services/rooms";

export type RoomsTranslate = (
  key: string,
  params?: Record<string, any>
) => string;

export type RoomPosition = {
  lat: number;
  lng: number;
  accuracy?: number | null;
};

export type RoomMapPin = {
  id: string;
  lat: number;
  lng: number;
  label?: string;
};

export type RoomUiMessage = RoomMessage & {
  failed?: boolean;
};

export type RoomsRangePreset = {
  id: string;
  labelKey: string;
  delta: number;
  scale: number;
};
