/**
 * ResultsScreen.js
 *
 * Displays the 20 extracted and processed marker images in a scrollable grid.
 * Each marker is displayed at exactly 300×300px as required by the spec.
 */

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

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Each marker must be displayed at exactly 300×300px
const MARKER_DISPLAY_SIZE = 300;

export default function ResultsScreen({ navigation, route }) {
  const { markers = [] } = route.params || {};

  const avgTime = useMemo(() => {
    if (markers.length === 0) return 0;
    const total = markers.reduce((sum, m) => sum + (m.processingTimeMs || 0), 0);
    return Math.round(total / markers.length);
  }, [markers]);

  const maxTime = useMemo(() => {
    if (markers.length === 0) return 0;
    return Math.max(...markers.map((m) => m.processingTimeMs || 0));
  }, [markers]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Detected Markers</Text>
        <Text style={styles.subtitle}>
          {markers.length} / 20 captured · avg {avgTime}ms · max {maxTime}ms
        </Text>
      </View>

      {/* Marker Grid */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {markers.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No markers detected yet.</Text>
            <Text style={styles.emptySubText}>
              Go back and scan the marker with your camera.
            </Text>
          </View>
        ) : (
          markers.map((marker, index) => (
            <View key={index} style={styles.markerCard}>
              {/* Label */}
              <View style={styles.markerLabel}>
                <Text style={styles.markerIndex}>#{index + 1}</Text>
                <Text style={styles.markerTime}>{marker.processingTimeMs}ms</Text>
              </View>

              {/* The marker image — exactly 300×300px as required */}
              <Image
                source={{ uri: marker.uri }}
                style={styles.markerImage}
                resizeMode="contain"
              />
            </View>
          ))
        )}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>← Scan Again</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    backgroundColor: '#111',
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: '#888',
    fontSize: 13,
    marginTop: 4,
  },
  scrollContent: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 20,
  },
  markerCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    // Card is slightly wider than the image to give a frame
    width: MARKER_DISPLAY_SIZE + 24,
  },
  markerLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#222',
  },
  markerIndex: {
    color: '#00FF88',
    fontSize: 13,
    fontWeight: '700',
  },
  markerTime: {
    color: '#888',
    fontSize: 12,
  },
  markerImage: {
    // Exactly 300×300px as required by the spec
    width: MARKER_DISPLAY_SIZE,
    height: MARKER_DISPLAY_SIZE,
    alignSelf: 'center',
    margin: 12,
    backgroundColor: '#fff',
  },
  emptyState: {
    marginTop: 80,
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#222',
    backgroundColor: '#111',
  },
  backButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
