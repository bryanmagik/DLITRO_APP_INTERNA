import { useTurno } from "./TurnoPage";
import EstadoCajaTab from "./tabs/EstadoCajaTab";

export default function EstadoCajaPage() {
  const { turno } = useTurno();
  return <EstadoCajaTab turno={turno} />;
}
