# Realtime WebSocket

Connect to the realtime endpoint with an access token:

```text
/ws?token=ACCESS_TOKEN
```

The server also accepts `Authorization: Bearer ACCESS_TOKEN` when the `token`
query parameter is absent. Prefer the header when the client platform supports
custom WebSocket headers, because query strings are more likely to appear in
logs. The query token remains supported for current mobile clients.

Invalid or missing access tokens close the socket with policy violation code
`1008`.

## Client Messages

Subscribe to inbox updates:

```json
{ "type": "subscribe", "channel": "inbox" }
```

Unsubscribe from inbox updates:

```json
{ "type": "unsubscribe", "channel": "inbox" }
```

Subscribe to a direct chat thread:

```json
{ "type": "subscribe", "channel": "thread", "threadId": "THREAD_UUID" }
```

Unsubscribe from a direct chat thread:

```json
{ "type": "unsubscribe", "channel": "thread", "threadId": "THREAD_UUID" }
```

Subscribe to a Together session:

```json
{ "type": "subscribe", "channel": "together", "sessionId": "SESSION_UUID" }
```

Unsubscribe from a Together session:

```json
{ "type": "unsubscribe", "channel": "together", "sessionId": "SESSION_UUID" }
```

Thread and Together subscriptions are authorized per resource. If the user does
not have access, the server sends:

```json
{ "type": "error", "code": "not_found", "message": "Thread not found" }
```

or:

```json
{ "type": "error", "code": "not_found", "message": "Together session not found" }
```

Malformed messages receive:

```json
{ "type": "error", "code": "invalid_message", "message": "Invalid websocket message" }
```

## Server Messages

Inbox update:

```json
{ "type": "inbox.updated" }
```

Thread message:

```json
{
  "type": "thread.message",
  "threadId": "THREAD_UUID",
  "message": {
    "id": "MESSAGE_UUID",
    "threadId": "THREAD_UUID",
    "fromUserId": "USER_UUID",
    "text": "Hello",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "clientMessageId": "client-generated-id"
  }
}
```

Together event:

```json
{
  "type": "together.event",
  "sessionId": "SESSION_UUID",
  "event": {
    "id": "EVENT_UUID",
    "sessionId": "SESSION_UUID",
    "fromUserId": "USER_UUID",
    "clientEventId": "client-generated-id",
    "type": "stroke_batch",
    "payload": {},
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
}
```
