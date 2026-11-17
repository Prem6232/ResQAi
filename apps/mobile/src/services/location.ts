import * as Location from "expo-location";
import { Platform } from "react-native";
import { GeoPoint } from "../types";

export const BHOPAL_CITY_FALLBACK: GeoPoint = {
  lat: 23.2599,
  lng: 77.4126,
};

let cachedLocation: GeoPoint | null = null;
let isRealGPSAcquired = false;
let locationWatchers: Array<(coords: GeoPoint) => void> = [];

export const mobileLocation = {
  /**
   * Request real OS foreground location permission from user
   */
  async requestPermission(): Promise<boolean> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === "granted";
    } catch (e) {
      console.warn("Location permission request error:", e);
      return false;
    }
  },

  /**
   * Check if location permission is already granted
   */
  async checkPermission(): Promise<boolean> {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      return status === "granted";
    } catch {
      return false;
    }
  },

  /**
   * Fetch the current real hardware GPS coordinates of the mobile device
   */
  async getCurrentLocation(): Promise<GeoPoint | null> {
    try {
      const hasPermission = await this.checkPermission();
      if (!hasPermission) {
        const granted = await this.requestPermission();
        if (!granted) return cachedLocation;
      }

      // Check if location services are enabled on the phone
      const isEnabled = await Location.hasServicesEnabledAsync();
      if (!isEnabled) {
        console.warn("Device location services (GPS) are turned off on mobile device.");
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const coords: GeoPoint = {
        lat: Number(position.coords.latitude.toFixed(6)),
        lng: Number(position.coords.longitude.toFixed(6)),
      };

      cachedLocation = coords;
      isRealGPSAcquired = true;
      locationWatchers.forEach((cb) => cb(coords));
      return coords;
    } catch (e) {
      console.warn("Failed to get high-accuracy current location, trying last known position:", e);
      try {
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (lastKnown) {
          const coords: GeoPoint = {
            lat: Number(lastKnown.coords.latitude.toFixed(6)),
            lng: Number(lastKnown.coords.longitude.toFixed(6)),
          };
          cachedLocation = coords;
          isRealGPSAcquired = true;
          return coords;
        }
      } catch (lastErr) {
        console.warn("Last known position error:", lastErr);
      }
      return cachedLocation;
    }
  },

  /**
   * Start live GPS position tracking stream (updates whenever user moves)
   */
  async startLiveTracking(
    onLocationUpdate: (coords: GeoPoint) => void
  ): Promise<() => void> {
    locationWatchers.push(onLocationUpdate);

    // If we already have a real GPS point, emit immediately
    if (cachedLocation) {
      onLocationUpdate(cachedLocation);
    }

    let subscription: Location.LocationSubscription | null = null;
    try {
      const hasPermission = await this.checkPermission();
      if (hasPermission) {
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 4000, // every 4 seconds
            distanceInterval: 5, // or when moved 5 meters
          },
          (loc) => {
            const coords: GeoPoint = {
              lat: Number(loc.coords.latitude.toFixed(6)),
              lng: Number(loc.coords.longitude.toFixed(6)),
            };
            cachedLocation = coords;
            isRealGPSAcquired = true;
            locationWatchers.forEach((cb) => cb(coords));
          }
        );
      }
    } catch (e) {
      console.warn("Error starting live GPS tracking subscription:", e);
    }

    return () => {
      locationWatchers = locationWatchers.filter((cb) => cb !== onLocationUpdate);
      if (subscription) {
        subscription.remove();
      }
    };
  },

  /**
   * Returns whether the location was acquired from real hardware GPS
   */
  isRealGPS(): boolean {
    return isRealGPSAcquired;
  },

  /**
   * Get latest known location or fallback
   */
  getLatest(): GeoPoint {
    return cachedLocation || BHOPAL_CITY_FALLBACK;
  },
};
