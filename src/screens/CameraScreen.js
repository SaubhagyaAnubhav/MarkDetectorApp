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

const TARGET_COUNT      = 20;
const CAPTURE_INTERVAL_MS = 500;
const SCAN_TIMEOUT_MS   = 30000;

const MARKER_CONFIG = {
  1: {
    label:       'Marker 1',
    description: '140×140mm · Solid border · Corner anchor',
    accentColor: '#007AFF',
    idleText:    'Point camera at Marker 1',
    scanText:    'Scanning for Marker 1…',
  },
  2: {
    label:       'Marker 2',
    description: '160×160mm · L-shape border · Dashed top/right',
    accentColor: '#BF5AF2',
    idleText:    'Point camera at Marker 2',
    scanText:    'Scanning for Marker 2…',
  },
};


export default function CameraScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [markerType, setMarkerType]   = useState(1);
  const markerTypeRef                 = useRef(1);

  const [isScanning, setIsScanning]       = useState(false);
  const [isProcessing, setIsProcessing]   = useState(false);
  const [detectedCount, setDetectedCount] = useState(0);
  const [status, setStatus] = useState({
    text: MARKER_CONFIG[1].idleText,
    type: 'idle',
  });

  const detectedMarkers    = useRef([]);
  const intervalRef        = useRef(null);
  const timeoutRef         = useRef(null);
  const isMounted          = useRef(true);
  const isProcessingRef    = useRef(false);

  const scanAnim  = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const flashAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    markerTypeRef.current = markerType;
  }, [markerType]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      clearInterval(intervalRef.current);
      clearTimeout(timeoutRef.current);
      scanAnim.stopAnimation();
      pulseAnim.stopAnimation();
      flashAnim.stopAnimation();
    };
  }, []);


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
      scanAnim.stopAnimation();
      scanAnim.setValue(0);
    }
  }, [isScanning]);

  
  useEffect(() => {
    if (isScanning) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.04, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isScanning]);

  
  const accentColor = MARKER_CONFIG[markerType].accentColor;

  const flashOnDetect = useCallback(() => {
    flashAnim.setValue(1);
    Animated.timing(flashAnim, {
      toValue: 0,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [flashAnim]);

  const onCameraReady = useCallback(() => {}, []);

  
  const captureAndProcess = useCallback(async () => {
    if (!cameraRef.current)                         return;
    if (isProcessingRef.current)                    return;
    if (detectedMarkers.current.length >= TARGET_COUNT) return;
    if (!isMounted.current)                         return;

    isProcessingRef.current = true;
    setIsProcessing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.6,
        skipProcessing: true,
        exif: false,
      });

      if (!isMounted.current) return;

      const { uri, width, height } = photo;
      const result = await processMarkerImage(uri, { width, height }, markerTypeRef.current);

      if (!isMounted.current) return;

      if (result.success && result.uri) {
        detectedMarkers.current.push({
          uri: result.uri,
          processingTimeMs: result.processingTimeMs,
          timestamp: Date.now(),
          markerType: markerTypeRef.current,
          orientation: result.orientation ?? 0,
          isCorrect: result.isCorrect ?? true,
        });

        const count = detectedMarkers.current.length;
        setDetectedCount(count);
        flashOnDetect();

        if (count >= TARGET_COUNT) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
          setIsScanning(false);
          setStatus({ text: `✓ All ${TARGET_COUNT} markers captured!`, type: 'done' });
          setTimeout(() => {
            if (isMounted.current) {
              navigation.navigate('Results', {
                markers: detectedMarkers.current,
                markerType: markerTypeRef.current,
              });
            }
          }, 600);
        } else {
          setStatus({
            text: `✓ Detected! ${count}/${TARGET_COUNT} — ${result.processingTimeMs}ms`,
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
      if (isMounted.current) setIsProcessing(false);
      isProcessingRef.current = false;
    }
  }, [flashOnDetect, navigation]);

  const captureAndProcessRef = useRef(captureAndProcess);
  useEffect(() => { captureAndProcessRef.current = captureAndProcess; }, [captureAndProcess]);

  
  const stopScanning = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    setIsScanning(false);
    setStatus({ text: 'Scan paused', type: 'idle' });
  }, []);

  
  const startScanning = useCallback(() => {
    if (intervalRef.current) return;

    detectedMarkers.current = [];
    setDetectedCount(0);
    setIsScanning(true);
    setStatus({ text: MARKER_CONFIG[markerTypeRef.current].scanText, type: 'scanning' });

    intervalRef.current = setInterval(() => {
      captureAndProcessRef.current();
    }, CAPTURE_INTERVAL_MS);

    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      if (isMounted.current && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        setIsScanning(false);
        setStatus({ text: 'Scan timed out. Try again.', type: 'error' });
      }
    }, SCAN_TIMEOUT_MS);
  }, []);

  
  const switchMarkerType = useCallback((type) => {
    if (isScanning) return;
    setMarkerType(type);
    setDetectedCount(0);
    detectedMarkers.current = [];
    setStatus({ text: MARKER_CONFIG[type].idleText, type: 'idle' });
  }, [isScanning]);

  
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

  
  const frameColor =
    status.type === 'success' || status.type === 'done'
      ? '#00E5A0'
      : status.type === 'error'
      ? '#FF453A'
      : status.type === 'scanning'
      ? accentColor
      : '#FFFFFF44';

  const scanLineY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, FRAME_SIZE - 4],
  });

  const progressPct = (detectedCount / TARGET_COUNT) * 100;
  const cfg = MARKER_CONFIG[markerType];

  
  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        pictureSize="1280x720"
        onCameraReady={onCameraReady}
      />

      
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: accentColor, opacity: flashAnim, pointerEvents: 'none' },
        ]}
      />

      <View style={styles.overlay}>
        
        <View style={[styles.topPanel, { height: (SCREEN_H - FRAME_SIZE) / 2.5 }]}>
          <View style={styles.typeSelector}>
            {[1, 2].map((type) => {
              const isActive = markerType === type;
              const c = MARKER_CONFIG[type];
              return (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeBtn,
                    isActive && { backgroundColor: c.accentColor + '22', borderColor: c.accentColor },
                    isScanning && styles.typeBtnDisabled,
                  ]}
                  onPress={() => switchMarkerType(type)}
                  activeOpacity={isScanning ? 1 : 0.7}
                  disabled={isScanning}
                >
                  <Text style={[styles.typeBtnLabel, isActive && { color: c.accentColor }]}>
                    {c.label}
                  </Text>
                  <Text style={styles.typeBtnDesc} numberOfLines={1}>
                    {c.description}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        
        <View style={styles.frameRow}>
          <View style={styles.darkSide} />

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
            <CornerBracket pos="TL" color={frameColor} />
            <CornerBracket pos="TR" color={frameColor} />
            <CornerBracket pos="BL" color={frameColor} />
            <CornerBracket pos="BR" color={frameColor} />

            
            {markerType === 2 && !isScanning && (
              <View style={styles.m2Hint}>
                <View style={[styles.m2HintLeft,   { borderColor: cfg.accentColor + '66' }]} />
                <View style={[styles.m2HintBottom, { borderColor: cfg.accentColor + '66' }]} />
                <View style={[styles.m2HintTop,   { borderColor: cfg.accentColor + '44', borderStyle: 'dashed' }]} />
                <View style={[styles.m2HintRight, { borderColor: cfg.accentColor + '44', borderStyle: 'dashed' }]} />
              </View>
            )}

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

        
        <View style={styles.bottomPanel}>
          
          <View
            style={[
              styles.statusBadge,
              status.type === 'success' || status.type === 'done'
                ? styles.badgeSuccess
                : status.type === 'error'
                ? styles.badgeError
                : status.type === 'scanning'
                ? [styles.badgeScanning, { backgroundColor: accentColor + '28' }]
                : styles.badgeIdle,
            ]}
          >
            <Text style={styles.statusText} numberOfLines={1}>
              {status.text}
            </Text>
          </View>

          
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${progressPct}%`, backgroundColor: accentColor },
              ]}
            />
          </View>
          <Text style={styles.countLabel}>
            {detectedCount} / {TARGET_COUNT} markers captured
          </Text>

          
          <View style={styles.controls}>
            {isProcessing && (
              <ActivityIndicator size="small" color={accentColor} style={{ marginRight: 12 }} />
            )}

            {!isScanning ? (
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, { backgroundColor: accentColor }]}
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
                    markerType,
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


function CornerBracket({ pos, color }) {
  const size  = 22;
  const thick = 3;
  const isTop  = pos === 'TL' || pos === 'TR';
  const isLeft = pos === 'TL' || pos === 'BL';

  return (
    <View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        top:    isTop  ? 0 : undefined,
        bottom: !isTop ? 0 : undefined,
        left:   isLeft  ? 0 : undefined,
        right:  !isLeft ? 0 : undefined,
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: 0, right: 0,
          height: thick,
          top:    isTop  ? 0 : undefined,
          bottom: !isTop ? 0 : undefined,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 0, bottom: 0,
          width: thick,
          left:  isLeft  ? 0 : undefined,
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

  
  topPanel: {
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 10,
  },
  typeBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFFFFF22',
    backgroundColor: '#FFFFFF0A',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  typeBtnDisabled: {
    opacity: 0.5,
  },
  typeBtnLabel: {
    color: '#FFFFFF88',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  typeBtnDesc: {
    color: '#FFFFFF44',
    fontSize: 10,
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

  m2Hint: {
    position: 'absolute',
    top: 20, left: 20, right: 20, bottom: 20,
  },
  m2HintLeft: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 2,
    borderLeftWidth: 2,
  },
  m2HintBottom: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: 2,
    borderBottomWidth: 2,
  },
  m2HintTop: {
    position: 'absolute',
    left: 0, right: 0, top: 0,
    height: 2,
    borderTopWidth: 2,
  },
  m2HintRight: {
    position: 'absolute',
    right: 0, top: 0, bottom: 0,
    width: 2,
    borderRightWidth: 2,
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
  badgeIdle:     { backgroundColor: '#FFFFFF18' },
  badgeScanning: { backgroundColor: '#007AFF28' },
  badgeSuccess:  { backgroundColor: '#00E5A028' },
  badgeError:    { backgroundColor: '#FF453A28' },
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