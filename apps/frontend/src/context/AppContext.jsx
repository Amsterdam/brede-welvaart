import { createContext, useContext, useState } from "react";

const AppContext = createContext();

export const AppProvider = ({ children }) => {
	const [commentMode, setCommentMode] = useState(false);
	const [clickPosition, setClickPosition] = useState();

	return (
		<AppContext.Provider
			value={{
				commentMode,
				setCommentMode,
				clickPosition,
				setClickPosition,
			}}
		>
			{children}
		</AppContext.Provider>
	);
};

export const useApp = () => useContext(AppContext);
