import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import Clarity from "@microsoft/clarity";

interface TrackContextValue {
  clarityTag: (key: string, value: string) => void;
  clarityEvent: (name: string) => void;
}

const TrackContext = createContext<TrackContextValue | undefined>(undefined);

interface TrackProviderProps {
  children: ReactNode;
}

export const TrackProvider: React.FC<TrackProviderProps> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);

  // Consent function
  const clarityConsent = () => {
    try {
      Clarity.consent();
    } catch (e) {
      // Do nothing
      console.error(e);
    }
  };

  const clarityTag = (key: string, value: string) => {
    try {
      Clarity.setTag(key, value);
    } catch (e) {
      // Do nothing
      console.error(e);
    }
  };

  const clarityEvent = (name: string) => {
    try {
      Clarity.event(name);
    } catch (e) {
      // Do nothing
      console.error(e);
    }
  };

  useEffect(() => {
    // Type assertion for env var (string | undefined)
    Clarity.init(process.env.REACT_APP_CLARITY_ID as string);
    setIsInitialized(true);
    clarityConsent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "c") {
        clarityEvent("KEYBOARD_COPY");
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "v") {
        clarityEvent("KEYBOARD_PASTE");
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized]);

  return (
    <TrackContext.Provider value={{ clarityTag, clarityEvent }}>
      {children}
    </TrackContext.Provider>
  );
};

// Custom hook with error if used outside provider
export const useTrack = (): TrackContextValue => {
  const context = useContext(TrackContext);
  if (!context) {
    throw new Error("useTrack must be used within a TrackProvider");
  }
  return context;
};
