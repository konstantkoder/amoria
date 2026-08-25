import React from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";

import { getStorySparkArt } from "@/assets/together/storySparkArt";
import CoreStateCard from "@/components/CoreStateCard";
import ScreenShell from "@/components/ScreenShell";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  type PlayStorySparksRouteProp,
  type RootStackNavigationProp,
} from "@/navigation/appRoutes";
import {
  reportClientError,
  sanitizeErrorForReport,
} from "@/services/api/clientErrorsApi";
import * as togetherApi from "@/services/api/togetherApi";
import { ApiError } from "@/services/api/apiClient";
import type {
  StorySparksPackDto,
  StorySparksRoundDto,
  TogetherEventDto,
  TogetherSessionResponse,
  TurnBasedMomentDto,
} from "@/services/api/types";
import * as wsClient from "@/services/realtime/wsClient";
import { getTogetherPeer, rememberTogetherSession } from "@/services/togetherCanvasState";
import {
  buildStoryChoicesFromEvents,
  getChoiceForUserRound,
  getRoundChoices,
  localizeStoryText,
  validateStoryPack,
} from "@/services/togetherStorySparksState";
import { theme } from "@/theme";

const POLL_INTERVAL_MS = 5000;

function buildClientEventId(userId: string, roundId: string) {
  return `${userId || "local"}-story-${roundId}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function readTogetherEvent(payload: wsClient.RealtimeMessage): TogetherEventDto | null {
  if (payload.type !== "together.event") return null;
  const event = payload.event && typeof payload.event === "object" ? payload.event : null;
  return event ? (event as TogetherEventDto) : null;
}

function readTogetherSessionUpdate(
  payload: wsClient.RealtimeMessage
): TogetherSessionResponse | null {
  if (payload.type !== "together.session.updated") return null;
  const session = payload.session && typeof payload.session === "object" ? payload.session : null;
  if (!session || !("session" in session)) return null;
  return session as TogetherSessionResponse;
}

function isTerminalClosedStatus(status?: string | null) {
  return status === "abandoned" || status === "cancelled";
}

function nextRouteForUnexpectedActivity(activity: string | undefined, sessionId: string) {
  if (activity === "draw") {
    return { name: "PlayCanvas" as const, params: { sessionId } };
  }
  return null;
}

export default function PlayStorySparksScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"PlayStorySparks">>();
  const route = useRoute<PlayStorySparksRouteProp>();
  const { user: authUser } = useAuth();
  const { locale, t } = useLocale();
  const tt = React.useCallback(
    (key: string, params?: Record<string, string>) => t(key, params),
    [t]
  );

  const sessionId = route.params.sessionId.trim();
  const isTurnBased = route.params.mode === "turn_based";
  const momentId = route.params.momentId;
  const uid = authUser?.id ?? "";
  const [sessionResponse, setSessionResponse] = React.useState<TogetherSessionResponse | null>(null);
  const [events, setEvents] = React.useState<TogetherEventDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const [savingRoundId, setSavingRoundId] = React.useState<string | null>(null);
  const [leaving, setLeaving] = React.useState(false);
  const [actionError, setActionError] = React.useState("");
  const [turnBasedMoment, setTurnBasedMoment] = React.useState<TurnBasedMomentDto | null>(null);
  const mountedRef = React.useRef(true);
  const finishPromiseRef = React.useRef<Promise<void> | null>(null);
  const choiceInFlightRef = React.useRef(false);
  const navigatedRef = React.useRef(false);
  const invalidPackReportedRef = React.useRef(false);

  const goToTogether = React.useCallback(() => {
    try {
      navigation.navigate("Tabs", { screen: "Together" });
    } catch (error) {
      const safeError = sanitizeErrorForReport(error);
      reportClientError({
        screen: "PlayStorySparksScreen",
        action: "exitTogetherSession",
        step: "navigationFailed",
        code: safeError.code,
        message: safeError.message,
        stack: safeError.stack,
        metadata: {
          sessionIdExists: Boolean(sessionId),
        },
      });
    }
  }, [navigation, sessionId]);

  const reportStoryFailure = React.useCallback(
    (step: string, message: string, error?: unknown, metadata?: Record<string, unknown>) => {
      const safeError = error ? sanitizeErrorForReport(error) : null;
      reportClientError({
        screen: "PlayStorySparksScreen",
        action: "storySparks",
        step,
        code: safeError?.code,
        message: safeError?.message ?? message,
        stack: safeError?.stack,
        metadata: {
          momentId: isTurnBased ? momentId ?? null : null,
          sessionId,
          stage: turnBasedMoment?.stage ?? "story",
          status: turnBasedMoment?.status ?? sessionResponse?.session.status ?? null,
          action: turnBasedMoment?.action ?? "story",
          role: turnBasedMoment?.role ?? null,
          isMyTurn: turnBasedMoment?.isMyTurn ?? null,
          httpStatus: error instanceof ApiError ? error.status : null,
          errorCode: safeError?.code ?? null,
          ...metadata,
        },
      });
    },
    [isTurnBased, momentId, sessionId, sessionResponse?.session.status, turnBasedMoment]
  );

  const routeUnexpectedActivity = React.useCallback(
    (response: TogetherSessionResponse) => {
      if (response.session.activity === "story_sparks") return false;
      const next = nextRouteForUnexpectedActivity(response.session.activity, sessionId);
      if (!next) return false;
      try {
        navigation.replace(next.name, next.params);
      } catch (error) {
        reportStoryFailure("failedStorySparksNavigation", "Failed to route unexpected Together activity", error, {
          activity: response.session.activity,
        });
        goToTogether();
      }
      return true;
    },
    [goToTogether, navigation, reportStoryFailure, sessionId]
  );

  const applySessionResponse = React.useCallback(
    (response: TogetherSessionResponse) => {
      rememberTogetherSession(response);
      if (!mountedRef.current) return;
      setSessionResponse(response);
      if (response.session.status === "finished" && !navigatedRef.current) {
        navigatedRef.current = true;
        try {
          navigation.replace("PlayResult", {
            sessionId: response.session.id,
            ...(isTurnBased ? { mode: "turn_based", momentId } : {}),
          });
        } catch (error) {
          reportStoryFailure("failedFinishNavigation", "Failed to open Story Sparks result", error, {
            status: response.session.status,
          });
        }
      }
    },
    [isTurnBased, momentId, navigation, reportStoryFailure]
  );

  const reloadEvents = React.useCallback(async () => {
    const response = await togetherApi.getSessionEvents(sessionId);
    if (mountedRef.current) {
      setEvents(response.items);
    }
    return response.items;
  }, [sessionId]);

  React.useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    setLoadError("");
    setActionError("");

    if (!uid || !sessionId) {
      setLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }

    void Promise.all([togetherApi.getSession(sessionId), togetherApi.getSessionEvents(sessionId)])
      .then(([session, sessionEvents]) => {
        if (!mountedRef.current) return;
        if (routeUnexpectedActivity(session)) return;

        if (!validateStoryPack(session.session.storyPack)) {
          if (!invalidPackReportedRef.current) {
            invalidPackReportedRef.current = true;
            reportStoryFailure("invalidStoryPack", "Story Sparks session is missing a valid backend pack", undefined, {
              packPresent: Boolean(session.session.storyPack),
              roundCount: session.session.storyPack?.rounds?.length ?? 0,
            });
          }
          setLoadError(
            tt(
              "play.storySparks.invalidPackBody"
            )
          );
          setLoading(false);
          return;
        }

        applySessionResponse(session);
        setEvents(sessionEvents.items);
        setLoading(false);
      })
      .catch((error) => {
        if (!mountedRef.current) return;
        reportStoryFailure("peerEventHydrateFailure", "Failed to hydrate Story Sparks session or events", error);
        setLoadError(
          tt(
            "play.storySparks.guardOfflineBody"
          )
        );
        setLoading(false);
      });
    if (isTurnBased && momentId) {
      void togetherApi.getTurnBasedMoment(momentId)
        .then((response) => { if (mountedRef.current) setTurnBasedMoment(response.moment); })
        .catch(() => undefined);
    }

    return () => {
      mountedRef.current = false;
    };
  }, [applySessionResponse, isTurnBased, momentId, reportStoryFailure, routeUnexpectedActivity, sessionId, tt, uid]);

  React.useEffect(() => {
    if (!uid || !sessionId) return;
    let alive = true;
    wsClient.connect();
    wsClient.subscribeTogetherSession(sessionId);
    const unsubscribe = wsClient.onMessage((payload) => {
      if (!alive) return;
      if (payload.type === "together.turn_based.updated" && isTurnBased && momentId) {
        void togetherApi.getTurnBasedMoment(momentId)
          .then((response) => { if (alive) setTurnBasedMoment(response.moment); })
          .catch(() => undefined);
        return;
      }
      if (String(payload.sessionId ?? "") !== sessionId) return;
      const sessionUpdate = readTogetherSessionUpdate(payload);
      if (sessionUpdate) {
        applySessionResponse(sessionUpdate);
        return;
      }

      const event = readTogetherEvent(payload);
      if (!event || event.type !== "story_choice") return;
      setEvents((current) =>
        current.some((item) => item.id === event.id || item.clientEventId === event.clientEventId)
          ? current
          : [...current, event]
      );
    });

    return () => {
      alive = false;
      unsubscribe();
      wsClient.unsubscribeTogetherSession(sessionId);
    };
  }, [applySessionResponse, isTurnBased, momentId, sessionId, uid]);

  React.useEffect(() => {
    if (!uid || !sessionId || sessionResponse?.session.status !== "active") return;

    let cancelled = false;
    const refreshBackendState = async () => {
      try {
        const [session, sessionEvents] = await Promise.all([
          togetherApi.getSession(sessionId),
          togetherApi.getSessionEvents(sessionId),
        ]);
        if (cancelled || !mountedRef.current) return;
        if (routeUnexpectedActivity(session)) return;
        if (!validateStoryPack(session.session.storyPack)) {
          reportStoryFailure("missingStoryCards", "Story Sparks polling found missing cards", undefined, {
            packPresent: Boolean(session.session.storyPack),
          });
          return;
        }
        applySessionResponse(session);
        setEvents(sessionEvents.items);
        if (isTurnBased && momentId) {
          const moment = await togetherApi.getTurnBasedMoment(momentId);
          if (!cancelled && mountedRef.current) setTurnBasedMoment(moment.moment);
        }
      } catch (error) {
        reportStoryFailure("peerEventHydrateFailure", "Failed to poll Story Sparks backend state", error);
      }
    };

    const timer = setInterval(() => {
      void refreshBackendState();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [
    applySessionResponse,
    reportStoryFailure,
    routeUnexpectedActivity,
    sessionId,
    sessionResponse?.session.status,
    uid,
    isTurnBased,
    momentId,
  ]);

  const session = sessionResponse?.session ?? null;
  const pack = session?.storyPack && validateStoryPack(session.storyPack) ? session.storyPack : null;
  const peer = React.useMemo(
    () => getTogetherPeer(sessionResponse, uid),
    [sessionResponse, uid]
  );
  const identityRevealed =
    !isTurnBased || Boolean(turnBasedMoment?.identityRevealed && sessionResponse?.identityRevealed);
  const peerName = identityRevealed
    ? peer?.displayName?.trim() || tt("profile.amoriaUser")
    : tt("together.turnBased.anonymousPeer");
  const choices = React.useMemo(
    () => (pack ? buildStoryChoicesFromEvents(events, pack) : []),
    [events, pack]
  );
  const participantsCount = Math.max(sessionResponse?.participants.length ?? 0, 2);
  const completedRoundCount = React.useMemo(() => {
    if (!pack) return 0;
    return pack.rounds.filter(
      (round) => getRoundChoices(choices, round.id).length >= participantsCount
    ).length;
  }, [choices, pack, participantsCount]);
  const currentRoundIndex = pack
    ? Math.min(completedRoundCount, pack.rounds.length - 1)
    : 0;
  const currentRound: StorySparksRoundDto | null = pack?.rounds[currentRoundIndex] ?? null;
  const myChoice = currentRound ? getChoiceForUserRound(choices, uid, currentRound.id) : null;
  const peerChoice = currentRound && peer?.id
    ? getChoiceForUserRound(choices, peer.id, currentRound.id)
    : null;
  const currentRoundChoices = currentRound ? getRoundChoices(choices, currentRound.id) : [];
  const currentRoundRevealed = currentRoundChoices.length >= participantsCount;
  const readyToFinish =
    session?.status === "active" &&
    Boolean(pack) &&
    completedRoundCount >= (pack?.rounds.length ?? 4);

  const completeSession = React.useCallback(async () => {
    if (!sessionId || finishPromiseRef.current || session?.status !== "active") return;

    const task = togetherApi
      .finish(sessionId)
      .then((response) => {
        applySessionResponse(response);
      })
      .catch((error) => {
        if (!mountedRef.current) return;
        reportStoryFailure("failedFinishNavigation", "Failed to finish Story Sparks session", error, {
          completedRoundCount,
        });
        setActionError(
          tt(
            "play.storySparks.finishFailed"
          )
        );
      })
      .finally(() => {
        finishPromiseRef.current = null;
      });

    finishPromiseRef.current = task;
    await task;
  }, [applySessionResponse, completedRoundCount, reportStoryFailure, session?.status, sessionId, tt]);

  React.useEffect(() => {
    if (isTurnBased || !readyToFinish) return;
    void completeSession();
  }, [completeSession, isTurnBased, readyToFinish]);

  const chooseCard = React.useCallback(
    async (cardId: string) => {
      if (
        !uid ||
        !sessionId ||
        !session ||
        !pack ||
        !currentRound ||
        session.status !== "active" ||
        myChoice ||
        choiceInFlightRef.current ||
        savingRoundId ||
        leaving
        || (isTurnBased && !turnBasedMoment?.isMyTurn)
      ) {
        return;
      }

      choiceInFlightRef.current = true;
      setSavingRoundId(currentRound.id);
      setActionError("");
      try {
        await togetherApi.sendEvent(sessionId, {
          clientEventId: buildClientEventId(uid, currentRound.id),
          type: "story_choice",
          payload: {
            roundId: currentRound.id,
            cardId,
            packId: pack.packId,
            clientRoundIndex: currentRoundIndex,
          },
        });
        if (isTurnBased && momentId) {
          const [, refreshedMoment] = await Promise.all([
            reloadEvents(),
            togetherApi.getTurnBasedMoment(momentId),
          ]);
          if (mountedRef.current) setTurnBasedMoment(refreshedMoment.moment);
        } else {
          await reloadEvents();
        }
      } catch (error) {
        if (!mountedRef.current) return;
        if (isTurnBased && momentId && error instanceof ApiError && error.status === 409) {
          const refreshedMoment = await togetherApi.getTurnBasedMoment(momentId).catch(() => null);
          if (mountedRef.current && refreshedMoment) {
            setTurnBasedMoment(refreshedMoment.moment);
            setActionError("");
          }
          return;
        }
        reportStoryFailure("failedStoryChoiceSend", "Failed to send Story Sparks choice", error, {
          roundId: currentRound.id,
          cardId,
          packId: pack.packId,
        });
        setActionError(
          tt(
            "play.storySparks.saveFailed"
          )
        );
      } finally {
        choiceInFlightRef.current = false;
        if (mountedRef.current) setSavingRoundId(null);
      }
    },
    [
      currentRound,
      currentRoundIndex,
      leaving,
      myChoice,
      pack,
      reloadEvents,
      reportStoryFailure,
      savingRoundId,
      session,
      sessionId,
      tt,
      uid,
      isTurnBased,
      momentId,
      turnBasedMoment?.isMyTurn,
    ]
  );

  const leaveSession = React.useCallback(async () => {
    if (leaving) return;
    if (!sessionId) {
      goToTogether();
      return;
    }
    if (isTurnBased) {
      goToTogether();
      return;
    }

    setLeaving(true);
    setActionError("");
    try {
      await togetherApi.leave(sessionId);
    } catch (error) {
      reportStoryFailure("leaveFailed", "Failed to leave Story Sparks session", error, {
        status: session?.status ?? null,
      });
      if (mountedRef.current) {
        Alert.alert(
          tt("play.togetherExit.leaveFailedTitle"),
          tt(
            "play.togetherExit.leaveFailedBody"
          )
        );
      }
    } finally {
      goToTogether();
      if (mountedRef.current) setLeaving(false);
    }
  }, [goToTogether, isTurnBased, leaving, reportStoryFailure, session?.status, sessionId, tt]);

  const handleBack = React.useCallback(() => {
    if (isTurnBased) {
      goToTogether();
      return;
    }
    if (session?.status !== "active") {
      goToTogether();
      return;
    }

    Alert.alert(
      tt("play.storySparks.leaveTitle"),
      tt(
        "play.storySparks.leaveDraftBody"
      ),
      [
        { text: tt("common.stay"), style: "cancel" },
        {
          text: tt("common.exit"),
          style: "destructive",
          onPress: () => {
            void leaveSession();
          },
        },
      ]
    );
  }, [goToTogether, isTurnBased, leaveSession, session?.status, tt]);

  const screenTitle = tt("play.storySparks.title");

  if (!uid || !sessionId) {
    return (
      <ScreenShell title={screenTitle} background="togetherObservatoryV6" showBack onBack={goToTogether}>
        <View style={styles.centerState}>
          <CoreStateCard
            icon="person-circle-outline"
            title={tt("play.storySparks.guardAuthTitle")}
            body={tt("play.storySparks.guardAuthBody")}
            primaryAction={{ label: tt("common.openProfile"), onPress: () => navigation.navigate("Profile") }}
            secondaryAction={{ label: tt("common.backToTogether"), onPress: goToTogether }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (loading) {
    return (
      <ScreenShell title={screenTitle} background="togetherObservatoryV6" showBack onBack={handleBack}>
        <View style={styles.centerState}>
          <CoreStateCard
            loading
            icon="book-outline"
            title={tt("play.storySparks.loadingTitle")}
            body={tt(
              "play.storySparks.loadingBody"
            )}
          />
        </View>
      </ScreenShell>
    );
  }

  if (loadError || !session || !pack || !currentRound) {
    return (
      <ScreenShell title={screenTitle} background="togetherObservatoryV6" showBack onBack={goToTogether}>
        <View style={styles.centerState}>
          <CoreStateCard
            icon="cloud-offline-outline"
            title={tt("play.storySparks.guardErrorTitle")}
            body={loadError || tt("play.storySparks.guardNotFoundBody")}
            primaryAction={{ label: tt("common.retry"), onPress: () => navigation.replace("PlayStorySparks", {
              sessionId,
              ...(isTurnBased ? { mode: "turn_based", momentId } : {}),
            }) }}
            secondaryAction={{ label: tt("common.backToTogether"), onPress: goToTogether }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (isTerminalClosedStatus(session.status)) {
    return (
      <ScreenShell title={screenTitle} background="togetherObservatoryV6" showBack onBack={goToTogether}>
        <View style={styles.centerState}>
          <CoreStateCard
            icon="ban-outline"
            title={tt("play.storySparks.interruptedTitle")}
            body={tt(
              "play.storySparks.interruptedBody"
            )}
            primaryAction={{
              label: tt("common.backToTogether"),
              onPress: goToTogether,
            }}
            secondaryAction={{
              label: tt("playHistory.startNewSession"),
              onPress: () => navigation.navigate("PlayMatch", { activity: "story_sparks" }),
            }}
          />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title={screenTitle} background="togetherObservatoryV6" showBack onBack={handleBack}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.kicker}>{tt("play.storySparks.kicker")}</Text>
          <Text style={styles.title}>
            {tt("play.storySparks.roundCounter", {
              current: new Intl.NumberFormat(locale).format(currentRoundIndex + 1),
              total: new Intl.NumberFormat(locale).format(pack.rounds.length),
            })}
          </Text>
          <Text style={styles.body}>
            {tt(
              "play.storySparks.phasePickBody"
            )}
          </Text>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>{tt("playDetail.partner")}</Text>
              <Text style={styles.metaValue}>{peerName}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>{tt("play.storySparks.metaProgress")}</Text>
              <Text style={styles.metaValue}>
                {new Intl.NumberFormat(locale).format(completedRoundCount)}/{new Intl.NumberFormat(locale).format(pack.rounds.length)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.roundCard}>
          <Text style={styles.sectionEyebrow}>
            {localizeStoryText(currentRound.title, locale)}
          </Text>
          <Text style={styles.sectionTitle}>
            {tt(`play.storySparks.round.${currentRound.id}`)}
          </Text>
          <View style={styles.cardGrid}>
            {currentRound.cards.map((card) => {
              const selected = myChoice?.cardId === card.id;
              const artwork = getStorySparkArt(card.id);
              return (
                <Pressable
                  key={card.id}
                  style={[
                    styles.storyCard,
                    selected ? styles.storyCardSelected : null,
                    myChoice ? styles.storyCardLocked : null,
                  ]}
                  onPress={() => void chooseCard(card.id)}
                  disabled={Boolean(myChoice) || Boolean(savingRoundId) || leaving}
                >
                  {artwork ? (
                    <Image
                      source={artwork}
                      style={styles.storyCardArt}
                      resizeMode="cover"
                      accessible={false}
                    />
                  ) : (
                    <Text style={styles.cardEmoji}>{card.emoji}</Text>
                  )}
                  <View style={styles.storyCardCopy}>
                    <Text style={styles.storyCardTitle}>
                      {localizeStoryText(card.title, locale)}
                    </Text>
                    {card.subtitle ? (
                      <Text style={styles.storyCardSubtitle}>
                        {localizeStoryText(card.subtitle, locale)}
                      </Text>
                    ) : null}
                  </View>
                  {selected ? <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" /> : null}
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hintText}>
            {myChoice
              ? currentRoundRevealed
                ? tt("play.storySparks.phaseRevealBody")
                : tt("play.storySparks.phaseWaitingBody")
              : tt("play.storySparks.cardsBackendHint")}
          </Text>
          {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
        </View>

        <View style={styles.sharedCard}>
          <Text style={styles.sectionTitle}>{tt("play.storySparks.sharedChoicesTitle")}</Text>
          <View style={styles.choiceRow}>
            <ChoicePill
              label={tt("common.you")}
              title={myChoice ? localizeStoryText(myChoice.card.title, locale) : null}
              emoji={myChoice?.card.emoji}
              emptyText={tt("play.storySparks.waitingMine")}
            />
            <ChoicePill
              label={peerName}
              title={currentRoundRevealed && peerChoice ? localizeStoryText(peerChoice.card.title, locale) : null}
              emoji={currentRoundRevealed ? peerChoice?.card.emoji : undefined}
              emptyText={
                peerChoice
                  ? tt("play.storySparks.peerChoiceLocked")
                  : tt("play.storySparks.waitingPeer")
              }
            />
          </View>
          {readyToFinish ? (
            <Text style={styles.hintText}>
              {tt("play.storySparks.phaseDoneBody")}
            </Text>
          ) : null}
          <Pressable
            style={[styles.secondaryButton, leaving ? styles.buttonDisabled : null]}
            onPress={() => void leaveSession()}
            disabled={leaving}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>
              {leaving
                ? tt("common.exiting")
                : tt("common.backToMainTabs")}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

function ChoicePill({
  label,
  title,
  emoji,
  emptyText,
}: {
  label: string;
  title: string | null;
  emoji?: string;
  emptyText: string;
}) {
  return (
    <View style={styles.choicePill}>
      <Text style={styles.choiceEmoji}>{emoji ?? "·"}</Text>
      <View style={styles.choiceTextWrap}>
        <Text style={styles.choiceLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.choiceValue} numberOfLines={2}>
          {title ?? emptyText}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centerState: {
    flex: 1,
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  heroCard: {
    padding: 18,
    gap: 12,
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  kicker: {
    color: "#FFE0B8",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    color: theme.colors.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
  },
  body: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: "row",
    gap: 10,
  },
  metaItem: {
    flex: 1,
    padding: 12,
    backgroundColor: "transparent",
  },
  metaLabel: {
    color: theme.colors.subtext,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  metaValue: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 4,
  },
  roundCard: {
    padding: 16,
    gap: 12,
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  sharedCard: {
    padding: 16,
    gap: 12,
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  sectionEyebrow: {
    color: "#FFE0B8",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  cardGrid: {
    gap: 10,
  },
  storyCard: {
    minHeight: 82,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  storyCardSelected: {
    backgroundColor: theme.colors.chipActiveBg,
    borderWidth: 1,
    borderColor: theme.colors.chipActiveBorder,
  },
  storyCardLocked: {
    opacity: 0.82,
  },
  cardEmoji: {
    width: 34,
    textAlign: "center",
    fontSize: 25,
  },
  storyCardArt: {
    width: 108,
    aspectRatio: 3 / 2,
    borderRadius: 10,
  },
  storyCardCopy: {
    flex: 1,
    gap: 3,
  },
  storyCardTitle: {
    color: theme.colors.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
  },
  storyCardSubtitle: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  hintText: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 19,
  },
  errorText: {
    color: "#FFB4B4",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  choiceRow: {
    gap: 10,
  },
  choicePill: {
    minHeight: 58,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  choiceEmoji: {
    width: 30,
    color: theme.colors.text,
    fontSize: 22,
    textAlign: "center",
  },
  choiceTextWrap: {
    flex: 1,
    gap: 2,
  },
  choiceLabel: {
    color: theme.colors.subtext,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  choiceValue: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: theme.shapes.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.58,
  },
});
