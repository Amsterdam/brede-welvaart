import { useEffect, useState } from "react";
import { Alert, Badge, Button, Column, Heading, Paragraph, Table } from "@amsterdam/design-system-react";
import { useAuth } from "@shared/ui/context/AuthContext";

const labels = {
	cosmos: "Database (Cosmos DB)",
	storage: "Documentopslag",
	aiService: "AI-service",
};

export default function Status() {
	const { getAccessToken } = useAuth();
	const [report, setReport] = useState(null);
	const [error, setError] = useState(false);
	const [loading, setLoading] = useState(true);

	const loadStatus = async () => {
		setLoading(true);
		setError(false);
		try {
			const token = await getAccessToken();
			const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || "http://localhost:3000"}/status`, {
				headers: { Authorization: `Bearer ${token}` },
			});
			if (!response.ok) throw new Error(`Onverwachte serverstatus: ${response.status}`);
			setReport(await response.json());
		} catch (statusError) {
			console.error("Status ophalen mislukt:", statusError);
			setError(true);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		void loadStatus();
	}, []);

	const allConnected = report?.status === "ok";

	return (
		<Column gap="large">
			<Column gap="small">
				<Heading level={1}>Status</Heading>
				<Paragraph size="large">
					Bekijk of de Brede Welvaart Scan verbinding heeft met de database, documentopslag en AI-service.
				</Paragraph>
			</Column>

			{error && (
				<Alert heading="De status kon niet worden opgehaald" headingLevel={2} severity="error">
					<Paragraph>De statuscontrole is niet bereikbaar. Probeer het opnieuw.</Paragraph>
				</Alert>
			)}

			{report && (
				<>
					<Alert
						heading={allConnected ? "Alle verbindingen werken" : "Er zijn verbindingsproblemen"}
						headingLevel={2}
						severity={allConnected ? "success" : "warning"}
					>
						<Paragraph>
							{allConnected
								? "Alle systemen zijn bereikbaar."
								: "Eén of meer systemen zijn niet bereikbaar. Bekijk de details hieronder."}
						</Paragraph>
					</Alert>

					<Table>
						<Table.Header>
							<Table.Row>
								<Table.HeaderCell>Onderdeel</Table.HeaderCell>
								<Table.HeaderCell>Status</Table.HeaderCell>
								<Table.HeaderCell>Details</Table.HeaderCell>
								<Table.HeaderCell>Reactietijd</Table.HeaderCell>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{report.checks.map((check) => (
								<Table.Row key={check.name}>
									<Table.Cell>{labels[check.name] || check.name}</Table.Cell>
									<Table.Cell>
										<Badge color={check.ok ? "lime" : "red"} label={check.ok ? "Verbonden" : "Geen verbinding"} />
									</Table.Cell>
									<Table.Cell>{check.detail}</Table.Cell>
									<Table.Cell>{check.latencyMs} ms</Table.Cell>
								</Table.Row>
							))}
						</Table.Body>
					</Table>
				</>
			)}

			<Button variant="secondary" onClick={() => void loadStatus()} disabled={loading}>
				{loading ? "Bezig met controleren…" : "Opnieuw controleren"}
			</Button>
		</Column>
	);
}
