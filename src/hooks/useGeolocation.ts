import { useState, useEffect } from "react";

interface GeolocationState {
  lat: number | null;
  lng: number | null;
  error: string | null;
  loading: boolean;
}

export const useGeolocation = (enabled: boolean = true) => {
  const [state, setState] = useState<GeolocationState>({
    lat: null,
    lng: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    if (!enabled) {
      setState(prev => ({ ...prev, loading: false }));
      return;
    }

    if (!navigator.geolocation) {
      setState({ lat: null, lng: null, error: "Geolocation not supported", loading: false });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log("Geolocation success:", position.coords.latitude, position.coords.longitude);
        setState({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          error: null,
          loading: false,
        });
      },
      (err) => {
        console.warn("Geolocation error:", err.message);
        setState({ lat: null, lng: null, error: err.message, loading: false });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [enabled]);

  return state;
};
