"""Gera VALUES SQL para a tabela `matches` a partir do dump da API football-data.org.

Uso (re-sync do calendário):
  1. TOKEN=$(security find-generic-password -s keli-vault/football-data -a default -w)
  2. curl -s -H "X-Auth-Token: $TOKEN" \
       "https://api.football-data.org/v4/competitions/WC/matches" > /tmp/wc26_matches.json
  3. python3 scripts/gen_wc26_sql.py   # escreve /tmp/wc26_values.sql
  4. Aplicar migration no Supabase com insert/upsert por ext_id (formato `fd-{id}`).

Traduz nomes das seleções para pt-BR e mapeia stages da API para os do schema.
"""

import json

T = {"Algeria": "Argélia", "Argentina": "Argentina", "Australia": "Austrália", "Austria": "Áustria", "Belgium": "Bélgica", "Bosnia-Herzegovina": "Bósnia-Herzegovina", "Brazil": "Brasil", "Canada": "Canadá", "Cape Verde Islands": "Cabo Verde", "Colombia": "Colômbia", "Congo DR": "RD Congo", "Croatia": "Croácia", "Curaçao": "Curaçao", "Czechia": "Tchéquia", "Ecuador": "Equador", "Egypt": "Egito", "England": "Inglaterra", "France": "França", "Germany": "Alemanha", "Ghana": "Gana", "Haiti": "Haiti", "Iran": "Irã", "Iraq": "Iraque", "Ivory Coast": "Costa do Marfim", "Japan": "Japão", "Jordan": "Jordânia", "Mexico": "México", "Morocco": "Marrocos", "Netherlands": "Países Baixos", "New Zealand": "Nova Zelândia", "Norway": "Noruega", "Panama": "Panamá", "Paraguay": "Paraguai", "Portugal": "Portugal", "Qatar": "Catar", "Saudi Arabia": "Arábia Saudita", "Scotland": "Escócia", "Senegal": "Senegal", "South Africa": "África do Sul", "South Korea": "Coreia do Sul", "Spain": "Espanha", "Sweden": "Suécia", "Switzerland": "Suíça", "Tunisia": "Tunísia", "Turkey": "Türkiye", "United States": "EUA", "Uruguay": "Uruguai", "Uzbekistan": "Uzbequistão"}

STAGES = {"GROUP_STAGE": "group", "LAST_32": "r32", "LAST_16": "r16", "QUARTER_FINALS": "qf", "SEMI_FINALS": "sf", "THIRD_PLACE": "third", "FINAL": "final"}


def esc(s):
    return s.replace("'", "''")


def tr(name):
    return esc(T.get(name, name)) if name else "A definir"


def to_row(m):
    g = "'" + m["group"].replace("GROUP_", "") + "'" if m.get("group") else "null"
    return (
        f"('fd-{m['id']}','{STAGES[m['stage']]}','{tr(m['homeTeam']['name'])}',"
        f"'{tr(m['awayTeam']['name'])}','{m['utcDate']}',{g})"
    )


def main():
    data = json.load(open("/tmp/wc26_matches.json"))
    rows = [to_row(m) for m in sorted(data["matches"], key=lambda x: x["utcDate"])]
    open("/tmp/wc26_values.sql", "w").write(",\n".join(rows))
    print(len(rows), "rows")
    print(rows[0])
    print(rows[-1])


if __name__ == "__main__":
    main()
