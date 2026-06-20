export const NEARBY_ROOM_THREAD_TYPE = "nearby_room";
export const NEARBY_ROOM_THREAD_SOURCE_TYPE = "nearby_room";

export type NearbyRoomChatInfoDto = {
  roomId: string;
  threadId: string;
  title: string;
};

export type NearbyRoomChatMessageDto = {
  id: string;
  roomId: string;
  threadId: string;
  fromUserId: string;
  text: string;
  createdAt: string;
  clientMessageId: string;
};

export type NearbyRoomOpenResponse = NearbyRoomChatInfoDto;

export type NearbyRoomMessagesQuery = {
  limit: number;
};

export type NearbyRoomMessagesResponse = {
  items: NearbyRoomChatMessageDto[];
};

export type SendNearbyRoomMessageBody = {
  clientMessageId: string;
  text: string;
};

export type SendNearbyRoomMessageResponse = {
  message: NearbyRoomChatMessageDto;
};
