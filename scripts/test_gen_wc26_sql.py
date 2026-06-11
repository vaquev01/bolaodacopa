from gen_wc26_sql import to_row, tr, esc


def test_tr_traduz_e_escapa():
    assert tr("Brazil") == "Brasil"
    assert tr("Cape Verde Islands") == "Cabo Verde"
    assert tr(None) == "A definir"
    assert esc("Côte d'Ivoire") == "Côte d''Ivoire"


def test_to_row_jogo_de_grupo():
    m = {
        "id": 537327,
        "stage": "GROUP_STAGE",
        "group": "GROUP_A",
        "utcDate": "2026-06-11T19:00:00Z",
        "homeTeam": {"name": "Mexico"},
        "awayTeam": {"name": "South Africa"},
    }
    assert to_row(m) == "('fd-537327','group','México','África do Sul','2026-06-11T19:00:00Z','A')"


def test_to_row_mata_mata_tbd():
    m = {
        "id": 537390,
        "stage": "FINAL",
        "group": None,
        "utcDate": "2026-07-19T19:00:00Z",
        "homeTeam": {"name": None},
        "awayTeam": {"name": None},
    }
    assert to_row(m) == "('fd-537390','final','A definir','A definir','2026-07-19T19:00:00Z',null)"
