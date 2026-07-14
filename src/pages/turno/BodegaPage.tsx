import { useTurno } from "./TurnoPage";
import BodegaTab from "./tabs/BodegaTab";
export default function BodegaPage() {
  const { turno } = useTurno();
  return <BodegaTab turno={turno} />;
}