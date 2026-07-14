import { useTurno } from "./TurnoPage";
import DespachadoresTab from "./tabs/DespachadoresTab";
export default function DespachadoresPage() {
  const { turno } = useTurno();
  return <DespachadoresTab turno={turno} />;
}