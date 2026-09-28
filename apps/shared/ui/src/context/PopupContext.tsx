import React, {
	createContext,
	useContext,
	useState,
	useCallback,
	useRef,
	ReactNode,
	ComponentType,
} from "react";

// Types for Card and Toast
export interface PopupCard {
	id: number;
	content: ReactNode;
	[key: string]: any;
}

export interface Toast {
	id: number;
	content: ReactNode;
	timeout?: number;
	[key: string]: any;
}

// Context value type
export interface PopupContextValue {
	showCard: (
		CardComponent: ComponentType<any>,
		type?: string,
		accept?: () => void,
		cardProps?: Record<string, any>,
		options?: Record<string, any>
	) => number | undefined;
	hideCard: (id: number) => void;
	showToast: (component: ReactNode, options?: { timeout?: number; [key: string]: any }) => number | null;
	cards: PopupCard[];
	toasts: Toast[];
}

// Create context with undefined as default for strict mode
const PopupContext = createContext<PopupContextValue | undefined>(undefined);

interface PopupProviderProps {
	children: ReactNode;
}

export const PopupProvider: React.FC<PopupProviderProps> = ({ children }) => {
	const [cards, setCards] = useState<PopupCard[]>([]);
	const [toasts, setToasts] = useState<Toast[]>([]);
	const activePopupTypes = useRef<Set<string>>(new Set());

	const closeCard = (
		id: number,
		type?: string,
		dismissPermanently: boolean = true,
		accept?: () => void
	) => {
		if (type) {
			activePopupTypes.current.delete(type);
		}

		if (dismissPermanently === true && type) {
			window.localStorage.setItem(`dismiss:${type}`, "true");
		}

		setCards((prev) => prev.filter((card) => card.id !== id));

		if (accept) {
			accept();
		}
	};

	const showToast = useCallback(
		(component: ReactNode, options: { timeout?: number; [key: string]: any } = {}) => {
			const id = Date.now();
			const timeout = options.timeout || 4000;

			// If toast exists with the same id, just skip
			if (toasts.some((toast) => toast.id === id)) {
				return null;
			}

			window.setTimeout(() => {
				setToasts((prev) => prev.filter((toast) => toast.id !== id));
			}, timeout);

			setToasts((prev) => [
				...prev,
				{
					id,
					content: component,
					...options,
				},
			]);

			return id;
		},
		[toasts]
	);

	const showCard = useCallback(
		(
			CardComponent: ComponentType<any>,
			type?: string,
			accept?: () => void,
			cardProps: Record<string, any> = {},
			options: Record<string, any> = {}
		) => {
			const id = Date.now();

			if (type && activePopupTypes.current.has(type)) {
				return;
			}

			if (type && window.localStorage.getItem(`dismiss:${type}`) === "true") {
				if (accept) accept();
				return;
			}

			setCards((prev) => [
				...prev,
				{
					id,
					content: (
						<CardComponent
							{...cardProps}
							id={id}
							close={(dismissPermanently: boolean = false) =>
								closeCard(id, type, dismissPermanently, accept)
							}
							accept={accept}
						/>
					),
					...options,
				},
			]);

			if (type) {
				activePopupTypes.current.add(type);
			}

			return id;
		},
		[]
	);

	const hideCard = useCallback((id: number) => closeCard(id), []);

	const contextValue: PopupContextValue = {
		showCard,
		hideCard,
		showToast,
		cards,
		toasts,
	};

	return (
		<PopupContext.Provider value={contextValue}>
			{children}
		</PopupContext.Provider>
	);
};

export const usePopup = (): PopupContextValue => {
	const context = useContext(PopupContext);
	if (!context) {
		throw new Error("usePopup must be used within a PopupProvider");
	}
	return context;
};
