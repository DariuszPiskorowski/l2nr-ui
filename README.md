# l2nr-ui

Builds a selected React component as a Node-RED Dashboard 2 widget. The
component must implement the adapter contract; this is not automatic
conversion of arbitrary application transports or routing.

The manifest accepts optional exact `input.topic` and `output.topic` defaults.
The wrapper passes `message`, `payload`, `inputTopic`, `outputTopic`, `nodeId`
and a per-widget `storageKey` to the component. Interactive components call
`onChange(payload, { topic })`; omitting metadata uses `output.topic`.
The runtime preserves that topic through Dashboard's action handler.
The component is responsible for input filtering and its settings UI.

For Radiant Dial, the component shares its panel and settings with the
standalone application. MQTT remains in the external Node-RED MQTT nodes.

Run `npm run check` and `npm test` to validate the converter. Generated package
version 0.5.2 includes the topic bridge; building/installing that package is a
separate step from editing the source.
