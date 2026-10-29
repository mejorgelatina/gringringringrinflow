# Probar los previews de GrinFlow v0.9

Estos endpoints son stateless y de demostración. No persisten datos, no llaman a mapas, no contactan conductores y no despachan operaciones. Usa solo datos sintéticos.

## 1. Arrancar

```bash
npm install
npm test
npm run dev
```

## 2. Matching preview

En otra terminal, ejecuta:

```bash
curl -s http://localhost:3000/api/demo/match-preview \
  -H 'content-type: application/json' \
  -d '{
    "offer": {
      "id": "demo-offer-1",
      "category": "panificados",
      "quantity": 10,
      "unit": "caja",
      "quantityBasis": "confirmed",
      "quantityConfirmed": true,
      "condition": "edible",
      "conditionConfirmed": true,
      "deadline": "2030-10-28T18:00:00Z"
    },
    "recipients": [{
      "id": "demo-recipient-1",
      "name": "Destino sintético",
      "categories": ["panificados"],
      "conditionPolicy": ["edible"],
      "confirmed": true,
      "capacity": 20,
      "intendedUse": "human_consumption",
      "availableUntil": "2030-10-28T20:00:00Z"
    }],
    "transports": [{
      "id": "demo-transport-1",
      "name": "Unidad sintética",
      "confirmed": true,
      "status": "available",
      "capacity": 15,
      "unit": "caja",
      "availableUntil": "2030-10-28T20:00:00Z"
    }],
    "routesByPair": {
      "demo-recipient-1:demo-transport-1": {
        "verified": true,
        "provider": "synthetic-example-only",
        "distanceKm": 3.2,
        "durationMinutes": 18,
        "estimatedArrivalAt": 1919432400000,
        "verifiedAt": "2030-10-28T12:00:00Z"
      }
    }
  }'
```

La ruta de este ejemplo es sintética, no una ruta real. Cambia `verified` a `false` o elimina los datos de ruta para ver el bloqueo de seguridad. La respuesta siempre debe interpretarse como `stateless_demo`.

## 3. Backhaul preview

```bash
curl -s http://localhost:3000/api/demo/backhaul-preview \
  -H 'content-type: application/json' \
  -d '{
    "trip": {
      "vehicleConfirmed": true,
      "originalDeliveryConfirmed": true,
      "capacity": 20,
      "loadAfterDropoff": 2,
      "availableUntil": "2030-10-28T17:00:00Z",
      "transportPermissionConfirmed": true
    },
    "offer": {
      "id": "demo-offer-backhaul",
      "category": "frutas",
      "quantity": 8,
      "quantityConfirmed": true,
      "condition": "edible",
      "conditionConfirmed": true,
      "deadline": "2030-10-28T15:00:00Z",
      "donorConfirmed": true,
      "shareConsent": true
    },
    "recipient": {
      "id": "demo-recipient-backhaul",
      "categories": ["frutas"],
      "conditionPolicy": ["edible"],
      "intendedUse": "human_consumption",
      "confirmed": true
    },
    "route": {
      "verified": true,
      "provider": "synthetic-example-only",
      "pickupEta": "2030-10-28T13:00:00Z",
      "deliveryEta": "2030-10-28T14:00:00Z",
      "incrementalKm": 3,
      "emptyKmAvoided": 12,
      "incrementalMinutes": 20,
      "verifiedAt": "2030-10-28T12:00:00Z"
    }
  }'
```

La ruta de este ejemplo es sintética, no una ruta real. El motor bloquea la oportunidad si el beneficio neto no es positivo o falta un requisito.

## Límites
- Máximo 20 KB por petición.
- Matching: máximo 20 destinos × 20 transportes.
- No usar direcciones, teléfonos, nombres de personas ni datos reales.
- No interpretar una evaluación elegible como autorización operativa.
