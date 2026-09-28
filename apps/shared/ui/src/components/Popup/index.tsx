import { usePopup } from "../../context/PopupContext";

import "./index.scss";

export const PopupManager = () => {
  const { cards, toasts } = usePopup();

  return (
    <>
      <div className="card-container">
        {cards.map(({ id, content }) => (
          <div key={`card-${id}-${Math.floor(Math.random() * 9999) + 1}`}>
            {content}
          </div>
        ))}
      </div>
      {toasts.map((toast) => (
        <div key={`toast-${toast.id}`}>{toast.content}</div>
      ))}
    </>
  );
};
