# L2NR UI
### Interfejs z Lovable jako widget Node-RED Dashboard 2

**L2NR UI** pozwala wykorzystać wybrany komponent React z projektu Lovable
jako instalowalny widget Node-RED Dashboard 2. Zachowujesz własny wygląd
interfejsu, a dane i komendy przekazujesz przez wiadomości Node-RED.

<p align="center">
  <img src="docs/images/radiant-dial.png" alt="Radiant Dial po konwersji do Node-RED Dashboard 2: nastawa 19,0°C, temperatura domu 19,8°C i odebrane dane" width="760">
</p>

<p align="center">
  <em>Radiant Dial po konwersji do Node-RED Dashboard 2 — działający widget z danymi live ze sterownika pieca.</em>
</p>

## Co robi konwerter?

- Analizuje projekt i wskazany komponent React.
- Odczytuje konfigurację widgetu z pliku `l2nr-ui.manifest.json`.
- Generuje node Dashboard 2 wraz z mostem pomiędzy interfejsem React a wiadomościami Node-RED.
- W GitHub Actions buduje frontend i tworzy paczkę instalacyjną `.tgz`.

Komponent musi obsługiwać opisany niżej kontrakt. Konwerter nie przenosi
automatycznie dowolnej logiki aplikacji, routingu ani połączeń z usługami.
Obsługę danych, ustawień i zdarzeń użytkownika należy przygotować w komponencie.

## Przykład: termostat Radiant Dial

[Radiant Dial](https://github.com/DariuszPiskorowski/radiant-dial) jest pierwszym
sprawdzonym przykładem integracji. Wspólny panel i ustawienia służą zarówno
aplikacji samodzielnej, jak i widgetowi Node-RED.

| Kierunek | Topik | Zawartość |
| --- | --- | --- |
| Sterownik → widget | `Heating/Control/state` | Stan sterownika, odczyty, nastawa, korekta AI i tryb |
| Widget → sterownik | `Heating/Control/set` | Komenda użytkownika w `msg.payload` |

W wersji widgetu **połączenie MQTT obsługują zewnętrzne nody MQTT In i MQTT Out**.
Termostat nie potrzebuje własnego klienta ani danych logowania do brokera.
Topiki można zmieniać w jego Ustawieniach; zmiana topiku wejściowego w UI
nie zmienia subskrypcji zewnętrznego noda MQTT In. MQTT Out powinien korzystać
z `msg.topic`.

Wersja paczki **0.5.3**:
- odbiera stan jako obiekt lub tekst JSON i filtruje topik wejściowy;
- pokazuje `effective_setpoint`, czyli temperaturę po korekcie AI;
- zmienia bazowy `setpoint` przyciskami ±0,5°C;
- nie wysyła komendy zwrotnej przy samym odebraniu stanu;
- zapisuje ustawienia topików osobno dla widgetu w danej przeglądarce.

Integrację sprawdzono z **Node-RED 5.0.7 i Dashboard 1.33.0**, bezpośrednio
oraz w iframe o wysokości 650 px. Działanie poprawki korekty AI potwierdzono
również na Raspberry Pi użytkownika.

## Kontrakt komponentu

Wrapper przekazuje do komponentu:

| Właściwość | Przeznaczenie |
| --- | --- |
| `message` | Wiadomość Node-RED, w tym `topic` i `payload` |
| `payload` | Dane wejściowe |
| `inputTopic`, `outputTopic` | Domyślne topiki z manifestu |
| `nodeId` | Identyfikator widgetu |
| `storageKey` | Klucz do zapisu ustawień danego widgetu |
| `onChange` | Callback wysyłający komendę z interfejsu |

Przykład wysłania komendy:

```tsx
onChange(
  { setpoint: 21.5, mode: "normal" },
  { topic: "Heating/Control/set" }
);
```

Wynik na wyjściu noda:

```json
{
  "topic": "Heating/Control/set",
  "payload": {
    "setpoint": 21.5,
    "mode": "normal"
  }
}
```

Pominięcie drugiego argumentu wykorzystuje `output.topic` z manifestu.
Most zachowuje topik podczas obsługi zdarzenia Dashboard.
Filtrowanie wejściowego topiku oraz panel ustawień są odpowiedzialnością komponentu.

## Budowanie w GitHub Actions

W repozytorium aplikacji, zawierającym manifest i komponent zgodny z kontraktem,
można użyć akcji konwertera:

```yaml
- uses: actions/checkout@v7
- name: Convert UI to a Dashboard 2 widget
  id: convert
  uses: DariuszPiskorowski/l2nr-ui@main
  with:
    command: build
    source: .
    output: .l2nr-output
```

Ścieżkę do gotowego archiwum zwraca `steps.convert.outputs.package`.
Dla kontrolowanych wydań warto przypiąć akcję do konkretnego commita.

W Radiant Dial workflow
[`l2nr-ui.yml`](https://github.com/DariuszPiskorowski/radiant-dial/blob/main/.github/workflows/l2nr-ui.yml)
dodatkowo rozpakowuje paczkę, uruchamia ją w testowym Node-RED i sprawdza
rzeczywiste wyjście widgetu w Chromium przed udostępnieniem artefaktu.

## Rozwój konwertera

Wymagany Node.js 24 lub nowszy.

```bash
npm ci
npm run check
npm test
npm run build
```

Edytowanie kodu źródłowego nie aktualizuje zainstalowanego widgetu.
Po zmianach należy zbudować paczkę, zainstalować ją w Node-RED,
zrestartować usługę i odświeżyć interfejs.
