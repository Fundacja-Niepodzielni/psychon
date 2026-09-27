#!/usr/bin/env bash
# Swiadek: fragment wziety doslownie z historii innego repo w tej samej
# organizacji (nie parafraza), do probki regresji "wylacznie N X"
# (ksztalt A) na materiale spoza tego katalogu.
#
# W_PYT_SCIEZKA OSOBNO od reszty noga 1b: potrzebuje wlasnej allowlisty percentyli
# (W_PYT_SCIEZKA_PERCENTYL, patrz dopisek przy definicji wyzej) - `grep -Eiv` odejmuje
# z kandydatow dokladnie te sciezki, ktore pasuja WYLACZNIE dzieki byciu jednym z
# czterech allowlistowanych percentyli, nie ruszajac zadnego innego wzorca w SCIEZKI_I.
