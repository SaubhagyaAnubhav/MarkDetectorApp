/**
 * CameraScreen.js
 *
 * Live camera feed with real-time Marker 1 detection.
 * - Captures frames every 600ms while scanning
 * - Shows animated scan-frame overlay with corner brackets
 * - Color-coded status feedback
 * - Progress bar tracking 20/20 captures
 * - Navigates to ResultsScreen when 20 unique markers captured
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { processMarkerImage } from '../utils/imageProcessor';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const FRAME_SIZE = Math.round(Math.min(SCREEN_W, SCREEN_H) * 0.72);

const TARGET_COUNT = 20;
const CAPTURE_INTERVAL_MS = 650;

export default function CameraScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectedCount, setDetectedCount] = useState(0);
  const [status, setStatus] = useState({ text: 'Point camera at Marker 1', type: 'idle' });

  const detectedMarkers = useRef([]);
  const intervalRef = useRef(null);
  const isMounted = useRef(true);
  const isProcessingRef = useRef(false);

  // Animated values
  const scanAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const flashAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      clearInterval(intervalRef.current);
    };
  }, []);

  // Scanning line animation
  useEffect(() => {
    if (isScanning) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanAnim, {
            toValue: 1,
            duration: 1800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scanAnim, {
            toValue: 0,
            duration: 1800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      scanAnim.setValue(0);
    }
  }, [isScanning]);

  // Corner bracket pulse
  useEffect(() => {
    if (isScanning) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.04,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isScanning]);

  // Flash on detection
  const flashOnDetect = useCallback(() => {
    flashAnim.setValue(1);
    Animated.timing(flashAnim, {
      toValue: 0,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [flashAnim]);

  // ── Camera ready: negotiate picture size ─────────────────────────────────
  const onCameraReady = useCallback(async () => {
    try {
      if (!cameraRef.current) return;
      const sizes = await cameraRef.current.getAvailablePictureSizes?.();
      if (!sizes || sizes.length === 0) return;

      // Preferred sizes in the 2000–3000px range per spec
      const preferred = ['2560x2560', '2048x2048', '2000x2000', '2592x2592', '3000x3000'];
      for (const p of preferred) {
        if (sizes.includes(p)) {
          cameraRef.current._pictureSize = p;
          return;
        }
      }
    } catch (e) {
      // Non-critical; keep default
    }
  }, []);

  // ── Core capture + process loop ───────────────────────────────────────────
  const captureAndProcess = useCallback(async () => {
    if (!cameraRef.current) return;
    if (isProcessingRef.current) return;
    if (detectedMarkers.current.length >= TARGET_COUNT) return;
    if (!isMounted.current) return;

    isProcessingRef.current = true;
    setIsProcessing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1.0,
        skipProcessing: false,
        exif: false,
      });

      if (!isMounted.current) return;

      const { uri, width, height } = photo;
      const result = await processMarkerImage(uri, { width, height });

      if (!isMounted.current) return;

      if (result.success && result.uri) {
        detectedMarkers.current.push({
          uri: result.uri,
          processingTimeMs: result.processingTimeMs,
          timestamp: Date.now(),
        });

        const count = detectedMarkers.current.length;
        setDetectedCount(count);
        flashOnDetect();

        if (count >= TARGET_COUNT) {
          // Done!
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          setIsScanning(false);
          setStatus({ text: `✓ All 20 markers captured!`, type: 'done' });
          setTimeout(() => {
            if (isMounted.current) {
              navigation.navigate('Results', {
                markers: detectedMarkers.current,
              });
            }
          }, 600);
        } else {
          setStatus({
            text: `✓ Marker detected! ${count}/${TARGET_COUNT} — ${result.processingTimeMs}ms`,
            type: 'success',
          });
        }
      } else {
        setStatus({
          text: `Scanning… ${detectedMarkers.current.length}/${TARGET_COUNT}`,
          type: 'scanning',
        });
      }
    } catch (err) {
      console.warn('[CameraScreen] Capture error:', err.message);
      if (isMounted.current) {
        setStatus({ text: 'Capture error — retrying…', type: 'error' });
      }
    } finally {
      if (isMounted.current) {
        setIsProcessing(false);
      }
      isProcessingRef.current = false;
    }
  }, [flashOnDetect, navigation]);

  const startScanning = useCallback(() => {
    detectedMarkers.current = [];
    setDetectedCount(0);
    setIsScanning(true);
    setStatus({ text: 'Scanning for Marker 1…', type: 'scanning' });

    intervalRef.current = setInterval(() => {
      captureAndProcess();
    }, CAPTURE_INTERVAL_MS);
  }, [captureAndProcess]);

  const stopScanning = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    setIsScanning(false);
    setStatus({ text: 'Scan paused', type: 'idle' });
  }, []);

  // ── Permission screens ─────────────────────────────────────────────────────
  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#00E5A0" />
        <Text style={styles.infoText}>Checking camera permission…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permIcon}>📷</Text>
        <Text style={styles.infoText}>Camera access is required to detect markers.</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Frame border color based on status ────────────────────────────────────
  const frameColor =
    status.type === 'success' || status.type === 'done'
      ? '#00E5A0'
      : status.type === 'error'
      ? '#FF453A'
      : status.type === 'scanning'
      ? '#007AFF'
      : '#FFFFFF44';

  const scanLineY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, FRAME_SIZE - 4],
  });

  const progressPct = (detectedCount / TARGET_COUNT) * 100;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Camera */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        onCameraReady={onCameraReady}
      />

      {/* Detection flash overlay */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: '#00E5A0', opacity: flashAnim, pointerEvents: 'none' },
        ]}
      />

      {/* Dark vignette + scan frame */}
      <View style={styles.overlay}>
        {/* Top dark band */}
        <View style={[styles.darkBand, { height: (SCREEN_H - FRAME_SIZE) / 2.5 }]} />

        {/* Scan frame row */}
        <View style={styles.frameRow}>
          <View style={styles.darkSide} />

          {/* The scan frame itself */}
          <Animated.View
            style={[
              styles.scanFrame,
              {
                width: FRAME_SIZE,
                height: FRAME_SIZE,
                borderColor: frameColor,
                transform: [{ scale: pulseAnim }],
              },
            ]}
          >
            {/* Corner brackets */}
            <CornerBracket pos="TL" color={frameColor} />
            <CornerBracket pos="TR" color={frameColor} />
            <CornerBracket pos="BL" color={frameColor} />
            <CornerBracket pos="BR" color={frameColor} />

            {/* Scanning line */}
            {isScanning && (
              <Animated.View
                style={[
                  styles.scanLine,
                  {
                    backgroundColor: frameColor,
                    transform: [{ translateY: scanLineY }],
                  },
                ]}
              />
            )}
          </Animated.View>

          <View style={styles.darkSide} />
        </View>

        {/* Bottom area: status + controls */}
        <View style={styles.bottomPanel}>
          {/* Status badge */}
          <View
            style={[
              styles.statusBadge,
              status.type === 'success' || status.type === 'done'
                ? styles.badgeSuccess
                : status.type === 'error'
                ? styles.badgeError
                : status.type === 'scanning'
                ? styles.badgeScanning
                : styles.badgeIdle,
            ]}
          >
            <Text style={styles.statusText} numberOfLines={1}>
              {status.text}
            </Text>
          </View>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>
          <Text style={styles.countLabel}>
            {detectedCount} / {TARGET_COUNT} markers captured
          </Text>

          {/* Buttons */}
          <View style={styles.controls}>
            {isProcessing && (
              <ActivityIndicator
                size="small"
                color="#00E5A0"
                style={{ marginRight: 12 }}
              />
            )}

            {!isScanning ? (
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary]}
                onPress={startScanning}
                activeOpacity={0.8}
              >
                <Text style={styles.btnText}>
                  {detectedCount > 0 ? '↺ Scan Again' : '▶ Start Scanning'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.btn, styles.btnStop]}
                onPress={stopScanning}
                activeOpacity={0.8}
              >
                <Text style={styles.btnText}>⏹ Stop</Text>
              </TouchableOpacity>
            )}

            {detectedCount > 0 && !isScanning && (
              <TouchableOpacity
                style={[styles.btn, styles.btnView]}
                onPress={() =>
                  navigation.navigate('Results', {
                    markers: detectedMarkers.current,
                  })
                }
                activeOpacity={0.8}
              >
                <Text style={styles.btnText}>View {detectedCount} →</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

/** Corner bracket decoration for scan frame */
function CornerBracket({ pos, color }) {
  const size = 22;
  const thick = 3;
  const isTop = pos === 'TL' || pos === 'TR';
  const isLeft = pos === 'TL' || pos === 'BL';

  return (
    <View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        top: isTop ? 0 : undefined,
        bottom: !isTop ? 0 : undefined,
        left: isLeft ? 0 : undefined,
        right: !isLeft ? 0 : undefined,
      }}
    >
      {/* Horizontal bar */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: thick,
          top: isTop ? 0 : undefined,
          bottom: !isTop ? 0 : undefined,
          backgroundColor: color,
        }}
      />
      {/* Vertical bar */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: thick,
          left: isLeft ? 0 : undefined,
          right: !isLeft ? 0 : undefined,
          backgroundColor: color,
        }}
      />
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
    backgroundColor: '#0A0A0A',
    padding: 28,
    gap: 16,
  },
  permIcon: {
    fontSize: 52,
    marginBottom: 8,
  },
  infoText: {
    color: '#ccc',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  darkBand: {
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  frameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  darkSide: {
    flex: 1,
    height: FRAME_SIZE,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  scanFrame: {
    borderWidth: 1.5,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    opacity: 0.75,
  },
  bottomPanel: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    justifyContent: 'flex-start',
    gap: 12,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'center',
  },
  badgeIdle: { backgroundColor: '#FFFFFF18' },
  badgeScanning: { backgroundColor: '#007AFF28' },
  badgeSuccess: { backgroundColor: '#00E5A028' },
  badgeError: { backgroundColor: '#FF453A28' },
  statusText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  progressTrack: {
    height: 5,
    backgroundColor: '#FFFFFF18',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#00E5A0',
    borderRadius: 3,
  },
  countLabel: {
    color: '#FFFFFF66',
    fontSize: 12,
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  btn: {
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    minWidth: 130,
  },
  btnPrimary: {
    backgroundColor: '#007AFF',
  },
  btnStop: {
    backgroundColor: '#FF453A',
  },
  btnView: {
    backgroundColor: '#00C47A',
  },
  btnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
