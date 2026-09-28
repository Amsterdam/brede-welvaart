import { useEffect, useState } from "react";
import moment from "moment";

export default function PageFooter({ currentPage, date, totalPages: propTotalPages }) {
	const [totalPages, setTotalPages] = useState(propTotalPages || 0);

	useEffect(() => {
		if (propTotalPages) {
			setTotalPages(propTotalPages);
		} else {
			setTotalPages(document.getElementsByClassName("transformcomponent-page").length);
		}
	}, [propTotalPages]);

	return (
		<div className="transformcomponent-page-footer">
			<span>
				{moment(date).format("DD-MM-YYYY")}
			</span>
			<span>
				<b>Pagina {currentPage + 1}</b> van {totalPages}
			</span>
		</div>
	);
}
