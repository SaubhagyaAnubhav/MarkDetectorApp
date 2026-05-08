/**
 * CameraScreen.js
 *
 * Live camera feed screen.
 * - Uses expo-camera to render a live preview
 * - Captures frames automatically every 500ms while scanning
 * - Runs marker detection on each captured frame
 * - Collects up to 20 unique detected markers
 * - Navigates to ResultsScreen once 20 are collected
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { processMarkerImage } from '../utils/imageProcessor';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Target 20 unique marker captures
const TARGET_COUNT = 20;
// Interval between capture attempts (ms)
const CAPTURE_INTERVAL_MS = 600;
// Camera photo quality (0–1). Higher = better detection but slower.
const PHOTO_QUALITY = 1.0;

// Preferred picture sizes in order (2000–3000px range per spec)
const PREFERRED_SIZES = ['2560x2560', '2048x2048', '2000x2000', '3000x3000', '2592x1944'];

export default function CameraScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [isScanning, setIsScanning] = useState(false);
  const [detectedCount, setDetectedCount] = useState(0);
  const [statusText, setStatusText] = useState('Point camera at the marker');
  const [isProcessing, setIsProcessing] = useState(false);
  const [pictureSize, setPictureSize] = useState('2048x2048');

  const detectedMarkers = useRef([]);
  const captureIntervalRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopScanning();
    };
  }, []);

  // Pick the best available picture size in the 2000–3000px range
  const onCameraReady = useCallback(async () => {
    try {
      if (!cameraRef.current) return;
      const sizes = await cameraRef.current.getAvailablePictureSizes();
      if (!sizes || sizes.length === 0) return;

      // Find the best match from our preferred list
      for (const preferred of PREFERRED_SIZES) {
        if (sizes.includes(preferred)) {
          setPictureSize(preferred);
          return;
        }
      }

      // Fallback: pick the largest size that fits within 3000px
      const validSizes = sizes.filter((s) => {
        const parts = s.split('x');
        if (parts.length !== 2) return false;
        const w = parseInt(parts[0], 10);
        const h = parseInt(parts[1], 10);
        return w >= 2000 && w <= 3000 && h >= 2000 && h <= 3000;
      });

      if (validSizes.length > 0) {
        // Sort descending by width
        validSizes.sort((a, b) => {
          const wa = parseInt(a.split('x')[0], 10);
          const wb = parseInt(b.split('x')[0], 10);
          return wb - wa;
        });
        setPictureSize(validSizes[0]);
      }
    } catch (e) {
      // Keep default if this fails
      console.warn('[CameraScreen] Could not get picture sizes:', e.message);
    }
  }, []);

  const stopScanning = useCallback(() => {
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
    setIsScanning(false);
  }, []);

  const captureAndProcess = useCallback(async () => {
    if (!cameraRef.current || isProcessing || !isMountedRef.current) return;
    if (detectedMarkers.current.length >= TARGET_COUNT) return;

    setIsProcessing(true);

    try {
      // Capture photo at full quality
      // expo-camera captures at the device's native resolution
      const photo = await cameraRef.current.takePictureAsync({
        quality: PHOTO_QUALITY,
        skipProcessing: false,
        exif: false,
      });

      if (!isMountedRef.current) return;

      const { uri, width, height } = photo;

      setStatusText(`Processing frame... (${detectedMarkers.current.length}/${TARGET_COUNT})`);

      const result = await processMarkerImage(uri, { width, height });

      if (!isMountedRef.current) return;

      if (result.success && result.uri) {
        detectedMarkers.current.push({
          uri: result.uri,
          processingTimeMs: result.processingTimeMs,
          timestamp: Date.now(),
        });

        const count = detectedMarkers.current.length;
        setDetectedCount(count);
        setStatusText(`Marker detected! (${count}/${TARGET_COUNT}) — ${result.processingTimeMs}ms`);

        if (count >= TARGET_COUNT) {
          stopScanning();
          setStatusText('All 20 markers captured!');
          // Navigate to results after a brief pause
          setTimeout(() => {
            if (isMountedRef.current) {
              navigation.navigate('Results', {
                markers: detectedMarkers.current,
              });
            }
          }, 500);
        }
      } else {
        setStatusText(`Scanning... (${detectedMarkers.current.length}/${TARGET_COUNT}) — No marker found`);
      }
    } catch (err) {
      console.error('[CameraScreen] Capture error:', err);
      if (isMountedRef.current) {
        setStatusText('Capture error, retrying...');
      }
    } finally {
      if (isMountedRef.current) {
        setIsProcessing(false);
      }
    }
  }, [isProcessing, stopScanning, navigation]);

  const startScanning = useCallback(() => {
    detectedMarkers.current = [];
    setDetectedCount(0);
    setIsScanning(true);
    setStatusText('Scanning for marker...');

    captureIntervalRef.current = setInterval(() => {
      captureAndProcess();
    }, CAPTURE_INTERVAL_MS);
  }, [captureAndProcess]);

  // ── Permission handling ────────────────────────────────────────────────────

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.infoText}>Checking camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.infoText}>Camera permission is required.</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Live Camera Feed */}
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        // Request highest available resolution (2000–3000px range per spec)
        pictureSize={pictureSize}
        onCameraReady={onCameraReady}
      >
        {/* Marker overlay guide */}
        <View style={styles.overlay}>
          <View style={styles.scanFrame} />
        </View>
      </CameraView>

      {/* Status bar */}
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>{statusText}</Text>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${(detectedCount / TARGET_COUNT) * 100}%` },
            ]}
          />
        </View>
        <Text style={styles.countText}>
          {detectedCount} / {TARGET_COUNT} markers
        </Text>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {!isScanning ? (
          <TouchableOpacity style={styles.button} onPress={startScanning}>
            <Text style={styles.buttonText}>Start Scanning</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.button, styles.stopButton]}
            onPress={stopScanning}
          >
            <Text style={styles.buttonText}>Stop</Text>
          </TouchableOpacity>
        )}

        {detectedCount > 0 && !isScanning && (
          <TouchableOpacity
            style={[styles.button, styles.viewButton]}
            onPress={() =>
              navigation.navigate('Results', { markers: detectedMarkers.current })
            }
          >
            <Text style={styles.buttonText}>View Results ({detectedCount})</Text>
          </TouchableOpacity>
        )}
      </View>

      {isProcessing && (
        <View style={styles.processingOverlay}>
          <ActivityIndicator size="small" color="#fff" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    padding: 20,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: SCREEN_WIDTH * 0.7,
    height: SCREEN_WIDTH * 0.7,
    borderWidth: 2,
    borderColor: '#00FF88',
    borderRadius: 4,
    backgroundColor: 'transparent',
  },
  statusBar: {
    backgroundColor: '#111',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 13,
    marginBottom: 8,
    textAlign: 'center',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#00FF88',
    borderRadius: 3,
  },
  countText: {
    color: '#aaa',
    fontSize: 12,
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#111',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 140,
    alignItems: 'center',
  },
  stopButton: {
    backgroundColor: '#FF3B30',
  },
  viewButton: {
    backgroundColor: '#34C759',
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  infoText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  processingOverlay: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    padding: 8,
  },
});
