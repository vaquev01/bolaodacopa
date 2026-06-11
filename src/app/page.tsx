export default function Home() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--space-4)",
        padding: "var(--space-6)",
        backgroundColor: "var(--color-bg-primary)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "var(--space-3)",
          maxWidth: 480,
          width: "100%",
          textAlign: "center",
        }}
      >
        {/* Badge */}
        <span
          style={{
            display: "inline-block",
            backgroundColor: "var(--color-accent)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.02em",
            padding: "4px 12px",
            borderRadius: "var(--radius-badge)",
          }}
        >
          Em breve
        </span>

        {/* Title */}
        <h1
          style={{
            fontSize: 34,
            fontWeight: 700,
            lineHeight: 1.2,
            color: "var(--color-text-primary)",
            margin: 0,
          }}
        >
          Bolão Copa 2026
        </h1>

        {/* Subtitle */}
        <p
          style={{
            fontSize: 17,
            fontWeight: 400,
            lineHeight: 1.5,
            color: "var(--color-text-secondary)",
            margin: 0,
          }}
        >
          Crie seu próprio bolão com regras configuráveis, convide amigos pelo
          WhatsApp e acompanhe o ranking ao vivo.
        </p>

        {/* Accent line */}
        <div
          style={{
            width: 48,
            height: 3,
            borderRadius: 2,
            backgroundColor: "var(--color-accent)",
            marginTop: "var(--space-2)",
          }}
        />

        {/* Card placeholder */}
        <div
          style={{
            width: "100%",
            backgroundColor: "var(--color-bg-card)",
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--shadow-card)",
            padding: "var(--space-6)",
            marginTop: "var(--space-4)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 15,
              color: "var(--color-text-secondary)",
              fontWeight: 500,
            }}
          >
            🏆 Scaffold pronto — implementação em andamento.
          </p>
        </div>
      </div>
    </main>
  );
}
