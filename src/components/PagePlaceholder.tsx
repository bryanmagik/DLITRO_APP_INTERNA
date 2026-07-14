interface Props {
  title: string;
  description?: string;
}
export const PagePlaceholder = ({ title, description }: Props) => (
  <div className="space-y-2">
    <h1 className="font-display text-4xl text-foreground tracking-wide">{title}</h1>
    {description && <p className="text-muted-foreground">{description}</p>}
    <div className="mt-8 p-12 bg-card border border-border rounded-xl text-center">
      <p className="text-muted-foreground uppercase tracking-widest text-sm">
        Próximamente · esta vista se construirá en una fase siguiente
      </p>
    </div>
  </div>
);