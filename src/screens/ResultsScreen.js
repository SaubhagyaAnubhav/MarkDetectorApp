import React, { useMemo } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';

const { width: SCREEN_W } = Dimensions.get('window');

const CARD_OUTER_PAD = 16;
const CARD_GAP       = 10;
const CARD_WIDTH     = Math.floor((SCREEN_W - CARD_OUTER_PAD * 2 - CARD_GAP) / 2);

const TARGET_COUNT = 20;

// ─── Marker type config (mirrors CameraScreen) ────────────────────────────────
const MARKER_CONFIG = {
  1: { label: 'Marker 1', accentColor: '#007AFF' },
  2: { label: 'Marker 2', accentColor: '#BF5AF2' },
};

const ORIENTATION_LABEL = {
  0:   '0°',
  90:  '90°',
  180: '180°',
  270: '270°',
};

// ─── ResultsScreen ────────────────────────────────────────────────────────────
export default function ResultsScreen({ navigation, route }) {
  const { markers = [], markerType = 1 } = route.params ?? {};
  const cfg = MARKER_CONFIG[markerType] ?? MARKER_CONFIG[1];

  // ── Stats ──
  const stats = useMemo(() => {
    if (markers.length === 0) return { avg: '-', min: '-', max: '-', total: 0, correctCount: 0 };
    const times  = markers.map((m) => m.processingTimeMs ?? 0);
    const total  = times.reduce((s, t) => s + t, 0);
    const correct = markers.filter((m) => m.isCorrect !== false).length;
    return {
      avg:          Math.round(total / times.length),
      min:          Math.min(...times),
      max:          Math.max(...times),
      total:        markers.length,
      correctCount: correct,
    };
  }, [markers]);

  const grade =
    markers.length === 0
      ? { label: 'No Data',    color: '#666' }
      : stats.avg < 1000
      ? { label: 'Excellent',  color: '#00E5A0' }
      : stats.avg < 2000
      ? { label: 'Good',       color: '#FFD60A' }
      : stats.avg < 3000
      ? { label: 'Acceptable', color: '#FF9F0A' }
      : { label: 'Slow',       color: '#FF453A' };

  // ── Build 2-col rows ──
  const rows = [];
  for (let i = 0; i < markers.length; i += 2) {
    rows.push([markers[i], markers[i + 1] ?? null]);
  }

  const emptySubtitle =
    markerType === 2
      ? 'Go back and scan Marker 2 with your camera.'
      : 'Go back and scan Marker 1 with your camera.';

  // ── Render ──
  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* ── Summary card ── */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View>
              <Text style={styles.summaryTitle}>Detection Results</Text>
              <View style={[styles.markerTypePill, { backgroundColor: cfg.accentColor + '22', borderColor: cfg.accentColor }]}>
                <Text style={[styles.markerTypeText, { color: cfg.accentColor }]}>{cfg.label}</Text>
              </View>
            </View>
            <View style={[styles.gradeBadge, { backgroundColor: grade.color + '22', borderColor: grade.color }]}>
              <Text style={[styles.gradeText, { color: grade.color }]}>{grade.label}</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <StatItem label="Captured" value={`${stats.total}/${TARGET_COUNT}`}               color={cfg.accentColor} />
            <StatItem label="Avg Time" value={stats.avg === '-' ? '-' : `${stats.avg}ms`}     color="#007AFF" />
            <StatItem label="Best"     value={stats.min === '-' ? '-' : `${stats.min}ms`}     color="#34C759" />
            <StatItem label="Worst"    value={stats.max === '-' ? '-' : `${stats.max}ms`}     color="#FF9F0A" />
          </View>

          {/* Correct / incorrect tally — only meaningful for Marker 1 which has orientation */}
          {markerType === 1 && stats.total > 0 && (
            <View style={styles.correctRow}>
              <View style={styles.correctItem}>
                <View style={[styles.correctDot, { backgroundColor: '#00E5A0' }]} />
                <Text style={styles.correctLabel}>
                  {stats.correctCount} correct
                </Text>
              </View>
              <View style={styles.correctItem}>
                <View style={[styles.correctDot, { backgroundColor: '#FF453A' }]} />
                <Text style={styles.correctLabel}>
                  {stats.total - stats.correctCount} incorrect
                </Text>
              </View>
            </View>
          )}

          <View style={styles.specRow}>
            <Text style={styles.specText}>✓ Each image: 300×300px</Text>
            <Text style={styles.specText}>✓ Orientation corrected</Text>
          </View>
        </View>

        {/* ── Marker grid ── */}
        {markers.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyTitle}>No Markers Captured</Text>
            <Text style={styles.emptySubtitle}>{emptySubtitle}</Text>
          </View>
        ) : (
          rows.map((row, ri) => (
            <View key={ri} style={styles.row}>
              {row.map((marker, ci) =>
                marker ? (
                  <MarkerCard
                    key={ci}
                    marker={marker}
                    index={ri * 2 + ci + 1}
                    accentColor={cfg.accentColor}
                    markerType={markerType}
                  />
                ) : (
                  <View key={ci} style={{ width: CARD_WIDTH }} />
                )
              )}
            </View>
          ))
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* ── Footer ── */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: cfg.accentColor }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Text style={styles.backBtnText}>↩ Scan Again</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── StatItem ──────────────────────────────────────────────────────────────────
function StatItem({ label, value, color }) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── MarkerCard ────────────────────────────────────────────────────────────────
function MarkerCard({ marker, index, accentColor, markerType }) {
  const isGood      = marker.processingTimeMs < 2000;
  const orientation = marker.orientation ?? 0;
  const isCorrect   = marker.isCorrect !== false;

  // Show orientation badge only for Marker 1 (which has rotation logic)
  const showOrientation = markerType === 1 && orientation !== 0;

  return (
    <View style={[styles.card, !isCorrect && styles.cardIncorrect]}>
      {/* Card header */}
      <View style={styles.cardHeader}>
        <Text style={[styles.cardIndex, { color: accentColor }]}>#{index}</Text>
        <View style={styles.cardBadges}>
          {/* Correct / incorrect badge */}
          {markerType === 1 && (
            <View style={[
              styles.correctnessBadge,
              { backgroundColor: isCorrect ? '#00E5A018' : '#FF453A18' },
            ]}>
              <Text style={[styles.correctnessText, { color: isCorrect ? '#00E5A0' : '#FF453A' }]}>
                {isCorrect ? '✓' : '✗'}
              </Text>
            </View>
          )}
          {/* Time badge */}
          <View style={[styles.timeBadge, { backgroundColor: isGood ? '#00E5A018' : '#FF9F0A18' }]}>
            <Text style={[styles.timeText, { color: isGood ? '#00E5A0' : '#FF9F0A' }]}>
              {marker.processingTimeMs}ms
            </Text>
          </View>
        </View>
      </View>

      {/* Image */}
      <Image
        source={{ uri: marker.uri }}
        style={styles.markerImg}
        resizeMode="cover"
        onError={() =>
          console.warn(`[ResultsScreen] Failed to load marker image #${index}: ${marker.uri}`)
        }
      />

      {/* Card footer */}
      <View style={styles.cardFooter}>
        <Text style={styles.cardSize}>300 × 300 px</Text>
        {showOrientation && (
          <View style={[styles.orientBadge, { backgroundColor: accentColor + '22' }]}>
            <Text style={[styles.orientText, { color: accentColor }]}>
              ↻ {ORIENTATION_LABEL[orientation] ?? `${orientation}°`}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  scroll: {
    padding: CARD_OUTER_PAD,
    gap: 16,
  },

  // ── Summary card ──
  summaryCard: {
    backgroundColor: '#161616',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    gap: 12,
    marginBottom: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  summaryTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  markerTypePill: {
    alignSelf: 'flex-start',
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  markerTypeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  gradeBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  gradeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  correctRow: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 4,
  },
  correctItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  correctDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  correctLabel: {
    color: '#FFFFFF88',
    fontSize: 12,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  specText: {
    color: '#00E5A0',
    fontSize: 11,
    fontWeight: '500',
  },

  // ── Grid ──
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  // ── Marker card ──
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#161616',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  cardIncorrect: {
    borderColor: '#FF453A44',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#1E1E1E',
  },
  cardIndex: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardBadges: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  correctnessBadge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  correctnessText: {
    fontSize: 11,
    fontWeight: '700',
  },
  timeBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  markerImg: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#fff',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  cardSize: {
    color: '#444',
    fontSize: 10,
  },
  orientBadge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  orientText: {
    fontSize: 10,
    fontWeight: '600',
  },

  // ── Empty state ──
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 52,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
  },

  // ── Footer ──
  footer: {
    padding: 16,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: '#1E1E1E',
    backgroundColor: '#111',
  },
  backBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  backBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});