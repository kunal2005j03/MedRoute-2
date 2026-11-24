# Return the Distance for a Route (Latitude/Longitude)

Calculate the route distance (along with duration and polyline geometry) between
two or more sets of latitude and longitude coordinates using the Routes API.

## Overview

You can request route calculations by sending an HTTP `POST` request to the
`computeRoutes` REST endpoint or by calling the `ComputeRoutes` gRPC method.

-   **REST Endpoint:**
    `https://routes.googleapis.com/directions/v2:computeRoutes`
-   **gRPC Host:** `routes.googleapis.com:443`

To retrieve the route distance, you must explicitly specify
`routes.distanceMeters` in the response field mask using the `X-Goog-FieldMask`
header (or the `$fields` URL parameter). Note that `distanceMeters` is always
returned in metric units regardless of the `units` parameter specified in the
request body.

--------------------------------------------------------------------------------

## REST API Workflow

### 1. Required Headers

When making a REST request, include the following HTTP headers:

-   `Content-Type: application/json`
-   `X-Goog-Api-Key: YOUR_API_KEY`
-   `X-Goog-FieldMask:
    routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline`
    (Specify only the fields your application requires).
-   `X-Goog-Maps-Solution-ID: gmp_git_agentskills_v1`

### 2. Request Body Structure

Construct a JSON payload containing the `origin` and `destination` objects
formatted with `location.latLng`, along with your desired routing options (such
as `travelMode` and `routingPreference`).

### Example: cURL Request

```bash
curl -X POST -d '{
  "origin":{
    "location":{
      "latLng":{
        "latitude": 37.419734,
        "longitude": -122.0827784
      }
    }
  },
  "destination":{
    "location":{
      "latLng":{
        "latitude": 37.417670,
        "longitude": -122.079595
      }
    }
  },
  "travelMode": "DRIVE",
  "routingPreference": "TRAFFIC_AWARE",
  "computeAlternativeRoutes": false,
  "routeModifiers": {
    "avoidTolls": false,
    "avoidHighways": false,
    "avoidFerries": false
  },
  "languageCode": "en-US",
  "units": "METRIC"
}' \
-H 'Content-Type: application/json' \
-H 'X-Goog-Api-Key: YOUR_API_KEY' \
-H 'X-Goog-FieldMask: routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline' \
-H 'X-Goog-Maps-Solution-ID: gmp_git_agentskills_v1' \
'https://routes.googleapis.com/directions/v2:computeRoutes'
```

### Example: JSON Response

```json
{
  "routes": [
    {
      "distanceMeters": 772,
      "duration": "165s",
      "polyline": {
        "encodedPolyline": "ipkcFfichVnP@j@BLoFVwM{E?"
      }
    }
  ]
}
```

--------------------------------------------------------------------------------

## gRPC Workflow

You can also call `ComputeRoutes` using gRPC across various languages. Pass the
API key, field mask, and solution ID in the request metadata.

> **Note:** Setting the field mask to `*` is acceptable for local testing, but
> strongly discouraged in production. Explicitly request `routes.distanceMeters`
> (and other needed fields) in production environments.

### Go Example

```go
package main

import (
    "context"
    "crypto/tls"
    "fmt"
    "log"
    "time"

    routespb "google.golang.org/genproto/googleapis/maps/routing/v2"
    "google.golang.org/genproto/googleapis/type/latlng"
    "google.golang.org/grpc"
    "google.golang.org/grpc/credentials"
    "google.golang.org/grpc/metadata"
)

const (
    fieldMask  = "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline"
    apiKey     = "INSERT_API_KEY_HERE"
    serverAddr = "routes.googleapis.com:443"
)

func main() {
    config := tls.Config{}
    conn, err := grpc.Dial(serverAddr,
        grpc.WithTransportCredentials(credentials.NewTLS(&config)))
    if err != nil {
        log.Fatalf("Failed to connect: %v", err)
    }
    defer conn.Close()
    client := routespb.NewRoutesClient(conn)
    ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
    ctx = metadata.AppendToOutgoingContext(ctx, "X-Goog-Api-Key", apiKey)
    ctx = metadata.AppendToOutgoingContext(ctx, "X-Goog-Fieldmask", fieldMask)
    ctx = metadata.AppendToOutgoingContext(ctx, "X-Goog-Maps-Solution-ID", "gmp_git_agentskills_v1")
    defer cancel()

    // Create the origin using a latitude and longitude
    origin := &routespb.Waypoint{
        LocationType: &routespb.Waypoint_Location{
            Location: &routespb.Location{
                LatLng: &latlng.LatLng{
                    Latitude:  37.417670,
                    Longitude: -122.0827784,
                },
            },
        },
    }

    // Create the destination using a latitude and longitude
    destination := &routespb.Waypoint{
        LocationType: &routespb.Waypoint_Location{
            Location: &routespb.Location{
                LatLng: &latlng.LatLng{
                    Latitude:  37.417670,
                    Longitude: -122.079595,
                },
            },
        },
    }

    req := &routespb.ComputeRoutesRequest{
        Origin:                   origin,
        Destination:              destination,
        TravelMode:               routespb.RouteTravelMode_DRIVE,
        RoutingPreference:        routespb.RoutingPreference_TRAFFIC_AWARE,
        ComputeAlternativeRoutes: true,
        Units:                    routespb.Units_METRIC,
        RouteModifiers: &routespb.RouteModifiers{
            AvoidTolls:    false,
            AvoidHighways: true,
            AvoidFerries:  true,
        },
        PolylineQuality: routespb.PolylineQuality_OVERVIEW,
    }

    // Execute RPC
    resp, err := client.ComputeRoutes(ctx, req)
    if err != nil {
        log.Fatal(err)
    }

    fmt.Printf("Response: %v", resp)
}
```

### Node.js Example

```javascript
const protoPath = "YOUR_PROTO_PATH";
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const packageDefinition = protoLoader.loadSync(protoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const protoDescriptor =
  grpc.loadPackageDefinition(packageDefinition).google.maps.routing.v2;
const metadata = new grpc.Metadata();
const host = "routes.googleapis.com:443";
const apiKey = "YOUR_API_KEY";
const fieldMask = "routes.distanceMeters,routes.duration";

let ComputeRoutesRequest = {
  origin: {
    location: {
      lat_lng: {
        latitude: -37.816,
        longitude: 144.964,
      },
    },
  },
  destination: {
    location: {
      lat_lng: {
        latitude: -37.815,
        longitude: 144.966,
      },
    },
  },
  routing_preference: "TRAFFIC_AWARE",
  travel_mode: "DRIVE",
};

const ssl_creds = grpc.credentials.createSsl();
const call_creds = grpc.credentials.createFromMetadataGenerator(
  function (args, callback) {
    metadata.set("X-Goog-Api-Key", apiKey);
    metadata.set("X-Goog-Fieldmask", fieldMask);
    metadata.set("X-Goog-Maps-Solution-ID", "gmp_git_agentskills_v1");
    metadata.set("Content-Type", "application/json");
    callback(null, metadata);
  }
);

const credentials = grpc.credentials.combineChannelCredentials(
  ssl_creds,
  call_creds
);

const client = new protoDescriptor.Routes(host, credentials);
client.ComputeRoutes(ComputeRoutesRequest, (error, response) => {
  if (error) {
    console.log(error);
    return;
  } else if (response) {
    console.log(response);
  }
});
```

### Java Example (ComputeRoutes & ComputeRouteMatrix)

If you need to calculate distances between multiple origins and multiple
destinations simultaneously, you can also use `computeRouteMatrix` as
demonstrated below alongside `computeRoutes`.

```java
package com.example;

import com.google.maps.routing.v2.*;
import com.google.type.LatLng;
import io.grpc.CallOptions;
import io.grpc.Channel;
import io.grpc.ClientCall;
import io.grpc.ClientInterceptor;
import io.grpc.ClientInterceptors;
import io.grpc.ForwardingClientCall;
import io.grpc.Metadata;
import io.grpc.MethodDescriptor;
import io.grpc.StatusRuntimeException;
import io.grpc.netty.NettyChannelBuilder;
import java.util.Iterator;
import java.util.concurrent.TimeUnit;
import java.util.logging.Level;
import java.util.logging.Logger;

public class RoutesClient {
   private static final class RoutesInterceptor implements ClientInterceptor {
       private final String apiKey;
       private static final Logger logger = Logger.getLogger(RoutesInterceptor.class.getName());
       private static Metadata.Key<String> API_KEY_HEADER = Metadata.Key.of("x-goog-api-key",
               Metadata.ASCII_STRING_MARSHALLER);
       private static Metadata.Key<String> FIELD_MASK_HEADER = Metadata.Key.of("x-goog-fieldmask",
               Metadata.ASCII_STRING_MARSHALLER);
       private static Metadata.Key<String> SOLUTION_ID_HEADER = Metadata.Key.of("x-goog-maps-solution-id",
               Metadata.ASCII_STRING_MARSHALLER);

       public RoutesInterceptor(String apiKey) {
           this.apiKey = apiKey;
       }

       @Override
       public <ReqT, RespT> ClientCall<ReqT, RespT> interceptCall(MethodDescriptor<ReqT, RespT> method,
               CallOptions callOptions, Channel next) {
           logger.info("Intercepted " + method.getFullMethodName());
           ClientCall<ReqT, RespT> call = next.newCall(method, callOptions);
           call = new ForwardingClientCall.SimpleForwardingClientCall<ReqT, RespT>(call) {
               @Override
               public void start(Listener<RespT> responseListener, Metadata headers) {
                   headers.put(API_KEY_HEADER, apiKey);
                   // In production, specify explicit fields such as:
                   // "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline"
                   headers.put(FIELD_MASK_HEADER, "*");
                   headers.put(SOLUTION_ID_HEADER, "gmp_git_agentskills_v1");
                   super.start(responseListener, headers);
               }
           };
           return call;
       }
   }

   private static final Logger logger = Logger.getLogger(RoutesClient.class.getName());
   private final RoutesGrpc.RoutesBlockingStub blockingStub;

   public RoutesClient(Channel channel) {
       blockingStub = RoutesGrpc.newBlockingStub(channel);
   }

   public static Waypoint createWaypointForLatLng(double lat, double lng) {
       return Waypoint.newBuilder()
               .setLocation(Location.newBuilder().setLatLng(LatLng.newBuilder().setLatitude(lat).setLongitude(lng)))
               .build();
   }

   public void computeRoutes() {
       ComputeRoutesRequest request = ComputeRoutesRequest.newBuilder()
               .setOrigin(createWaypointForLatLng(37.420761, -122.081356))
               .setDestination(createWaypointForLatLng(37.420999, -122.086894))
               .setTravelMode(RouteTravelMode.DRIVE)
               .setRoutingPreference(RoutingPreference.TRAFFIC_AWARE)
               .setComputeAlternativeRoutes(true)
               .setRouteModifiers(
                       RouteModifiers.newBuilder().setAvoidTolls(false).setAvoidHighways(true).setAvoidFerries(true))
               .setPolylineQuality(PolylineQuality.OVERVIEW)
               .build();
       ComputeRoutesResponse response;
       try {
           logger.info("About to send request: " + request.toString());
           response = blockingStub.withDeadlineAfter(2000, TimeUnit.MILLISECONDS).computeRoutes(request);
       } catch (StatusRuntimeException e) {
           logger.log(Level.WARNING, "RPC failed: {0}", e.getStatus());
           return;
       }
       logger.info("Response: " + response.toString());
   }

   public void computeRouteMatrix() {
       ComputeRouteMatrixRequest request = ComputeRouteMatrixRequest.newBuilder()
               .addOrigins(RouteMatrixOrigin.newBuilder().setWaypoint(createWaypointForLatLng(37.420761, -122.081356))
                       .setRouteModifiers(RouteModifiers.newBuilder().setAvoidTolls(false).setAvoidHighways(true)
                               .setAvoidFerries(true)))
               .addOrigins(RouteMatrixOrigin.newBuilder().setWaypoint(createWaypointForLatLng(37.403184, -122.097371)))
               .addDestinations(RouteMatrixDestination.newBuilder()
                       .setWaypoint(createWaypointForLatLng(37.420999, -122.086894)))
               .addDestinations(RouteMatrixDestination.newBuilder()
                       .setWaypoint(createWaypointForLatLng(37.383047, -122.044651)))
               .setTravelMode(RouteTravelMode.DRIVE)
               .setRoutingPreference(RoutingPreference.TRAFFIC_AWARE)
               .build();
       Iterator<RouteMatrixElement> elements;
       try {
           logger.info("About to send request: " + request.toString());
           elements = blockingStub.withDeadlineAfter(2000, TimeUnit.MILLISECONDS).computeRouteMatrix(request);
       } catch (StatusRuntimeException e) {
           logger.log(Level.WARNING, "RPC failed: {0}", e.getStatus());
           return;
       }

       while (elements.hasNext()) {
           logger.info("Element response: " + elements.next().toString());
       }
   }

   public static void main(String[] args) throws Exception {
       String apiKey = System.getenv("INSERT_API_KEY_HERE");

       Channel channel = NettyChannelBuilder.forAddress("routes.googleapis.com", 443).build();
       channel = ClientInterceptors.intercept(channel, new RoutesInterceptor(apiKey));

       RoutesClient client = new RoutesClient(channel);
       client.computeRoutes();
       client.computeRouteMatrix();
   }
}
```
