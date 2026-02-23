import { useState, useEffect, useCallback } from "react";

interface GeolocationState {
  lat: number | null;
  lng: number | null;
  error: string | null;
  loading: boolean;
}

const HIGH_ACCURACY_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 12000,
  maximumAge: 0,
};

const LOW_ACCURACY_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 20000,
  maximumAge: 60000,
};

const PERMISSION_DENIED_CODE = 1;
const TIMEOUT_CODE = 3;

export const useGeolocation = (enabled: boolean = true) => {
  const [state, setState] = useState<GeolocationState>({
    lat: null,
    lng: null,
    error: null,
    loading: true,
  });

  const requestLocation = useCallback(() => {
    if (!enabled) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }

    if (!navigator.geolocation) {
      setState({ lat: null, lng: null, error: "Geolocation not supported", loading: false });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    const handleSuccess = (position: GeolocationPosition) => {
      console.log("Geolocation success:", position.coords.latitude, position.coords.longitude);
      setState({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        error: null,
        loading: false,
      });
    };

    const setGeoError = (err: GeolocationPositionError) => {
      console.warn("Geolocation error:", err.message);
      if (err.code === PERMISSION_DENIED_CODE) {
        setState({
          lat: null,
          lng: null,
          error: "Location permission denied. Please allow location access and tap retry.",
          loading: false,
        });
        return;
      }
      setState({ lat: null, lng: null, error: err.message, loading: false });
    };

    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      (err) => {
        if (err.code === TIMEOUT_CODE) {
          navigator.geolocation.getCurrentPosition(handleSuccess, setGeoError, LOW_ACCURACY_OPTIONS);
          return;
        }
        setGeoError(err);
      },
      HIGH_ACCURACY_OPTIONS,
    );
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }

    requestLocation();
  }, [enabled, requestLocation]);

  const permissionDenied = state.error ? /denied|permission/i.test(state.error) : false;

  return {
    ...state,
    permissionDenied,
    requestLocation,
  };
};
