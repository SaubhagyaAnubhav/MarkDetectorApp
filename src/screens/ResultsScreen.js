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

const MARKER_SIZE = 300;
const CARD_OUTER_PAD = 16;
const CARD_GAP = 10;
const CARD_WIDTH = Math.floor((SCREEN_W - CARD_OUTER_PAD * 2 - CARD_GAP) / 2);

export default function ResultsScreen({ navigation, route }) {
  const { markers = [] } = route.params ?? {};

  const stats = useMemo(() => {
    if (markers.length === 0) return { avg: 0, min: 0, max: 0, total: 0 };
    const times = markers.map((m) => m.processingTimeMs ?? 0);
    const total = times.reduce((s, t) => s + t, 0);
    return {
      avg: Math.round(total / times.length),
      min: Math.min(...times),
      max: Math.max(...times),
      total: markers.length,
    };
  }, [markers]);

  const grade =
    stats.avg < 1000
      ? { label: 'Excellent', color: '#00E5A0' }
      : stats.avg < 2000
      ? { label: 'Good', color: '#FFD60A' }
      : stats.avg < 3000
      ? { label: 'Acceptable', color: '#FF9F0A' }
      : { label: 'Slow', color: '#FF453A' };

  const rows = [];
  for (let i = 0; i < markers.length; i += 2) {
    rows.push([markers[i], markers[i + 1] ?? null]);
  }

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Performance Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryTitle}>Detection Results</Text>
            <View style={[styles.gradeBadge, { backgroundColor: grade.color + '22', borderColor: grade.color }]}>
              <Text style={[styles.gradeText, { color: grade.color }]}>{grade.label}</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <StatItem label="Captured" value={`${stats.total}/20`} color="#00E5A0" />
            <StatItem label="Avg Time" value={`${stats.avg}ms`} color="#007AFF" />
            <StatItem label="Best" value={`${stats.min}ms`} color="#34C759" />
            <StatItem label="Worst" value={`${stats.max}ms`} color="#FF9F0A" />
          </View>

          <View style={styles.specRow}>
            <Text style={styles.specText}>✓ Each image: 300×300px</Text>
            <Text style={styles.specText}>✓ Orientation corrected</Text>
          </View>
        </View>

        {/* Marker Grid */}
        {markers.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyTitle}>No Markers Captured</Text>
            <Text style={styles.emptySubtitle}>
              Go back and scan Marker 1 with your camera.
            </Text>
          </View>
        ) : (
          rows.map((row, ri) => (
            <View key={ri} style={styles.row}>
              {row.map((marker, ci) =>
                marker ? (
                  <MarkerCard key={ci} marker={marker} index={ri * 2 + ci + 1} />
                ) : (
                  <View key={ci} style={{ width: CARD_WIDTH }} />
                )
              )}
            </View>
          ))
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Text style={styles.backBtnText}>↩ Scan Again</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function StatItem({ label, value, color }) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MarkerCard({ marker, index }) {
  const isGood = marker.processingTimeMs < 2000;
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardIndex}>#{index}</Text>
        <View
          style={[
            styles.timeBadge,
            { backgroundColor: isGood ? '#00E5A018' : '#FF9F0A18' },
          ]}
        >
          <Text style={[styles.timeText, { color: isGood ? '#00E5A0' : '#FF9F0A' }]}>
            {marker.processingTimeMs}ms
          </Text>
        </View>
      </View>

      {/* Marker image — file is exactly 300×300px per spec */}
      <Image
        source={{ uri: marker.uri }}
        style={styles.markerImg}
        resizeMode="cover"
      />

      <Text style={styles.cardSize}>300 × 300 px</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  scroll: {
    padding: CARD_OUTER_PAD,
    gap: 16,
  },

  // Summary card
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
    alignItems: 'center',
  },
  summaryTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  gradeBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
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

  // Grid
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  // Marker card
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#161616',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2A2A2A',
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
    color: '#00E5A0',
    fontSize: 12,
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
    // File is 300×300px per spec; displayed to fill the card width
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#fff',
  },
  cardSize: {
    color: '#444',
    fontSize: 10,
    textAlign: 'center',
    paddingVertical: 5,
  },

  // Empty state
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

  // Footer
  footer: {
    padding: 16,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: '#1E1E1E',
    backgroundColor: '#111',
  },
  backBtn: {
    backgroundColor: '#007AFF',
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
