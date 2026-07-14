import { useTurno } from "./TurnoPage";
import GastosTab from "./tabs/GastosTab";
export default function GastosPage() {
  const { turno } = useTurno();
  return <GastosTab turno={turno} />;
}