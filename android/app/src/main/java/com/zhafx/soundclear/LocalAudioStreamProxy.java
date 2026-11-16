package com.zhafx.soundclear;

import android.text.TextUtils;
import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Resolves direct audio streams via YouTube InnerTube on-device and serves them over a local
 * loopback HTTP proxy with full Range (206 Partial Content) + CORS headers so standard HTML5
 * <audio> elements play reliably without falling back to a YouTube <iframe>.
 */
public final class LocalAudioStreamProxy {

    public static final class ResolvedAudioResult {
        public final String proxyUrl;
        public final String mimeType;
        public final int bitrateKbps;
        public final String codec;

        public ResolvedAudioResult(String proxyUrl, String mimeType, int bitrateKbps, String codec) {
            this.proxyUrl = proxyUrl;
            this.mimeType = mimeType;
            this.bitrateKbps = bitrateKbps;
            this.codec = codec;
        }
    }

    private static final class CachedStream {
        final String upstreamUrl;
        final String userAgent;
        final String mimeType;
        final int bitrateKbps;
        final String codec;
        final long expiresAtMs;

        CachedStream(
            String upstreamUrl,
            String userAgent,
            String mimeType,
            int bitrateKbps,
            String codec,
            long expiresAtMs
        ) {
            this.upstreamUrl = upstreamUrl;
            this.userAgent = userAgent;
            this.mimeType = mimeType;
            this.bitrateKbps = bitrateKbps;
            this.codec = codec;
            this.expiresAtMs = expiresAtMs;
        }

        boolean isExpired() {
            return System.currentTimeMillis() >= expiresAtMs;
        }
    }

    private static final class ClientProfile {
        final String name;
        final String clientId;
        final String version;
        final String userAgent;
        final String origin;

        ClientProfile(String name, String clientId, String version, String userAgent, String origin) {
            this.name = name;
            this.clientId = clientId;
            this.version = version;
            this.userAgent = userAgent;
            this.origin = origin;
        }
    }

    private static final long STREAM_CACHE_TTL_MS = 90L * 60L * 1000L;
    private static final MediaType JSON_MEDIA_TYPE =
        MediaType.parse("application/json; charset=utf-8");

    private static final ClientProfile[] CLIENTS = new ClientProfile[] {
        new ClientProfile(
            "ANDROID_VR",
            "28",
            "1.61.48",
            "com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
            "https://www.youtube.com"
        ),
        new ClientProfile(
            "IOS",
            "5",
            "20.10.4",
            "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
            "https://www.youtube.com"
        ),
        new ClientProfile(
            "ANDROID_MUSIC",
            "21",
            "7.29.52",
            "com.google.android.apps.youtube.music/7.29.52 (Linux; U; Android 14) gzip",
            "https://music.youtube.com"
        )
    };

    private static LocalAudioStreamProxy instance;

    private final OkHttpClient httpClient;
    private final Map<String, CachedStream> cache = new ConcurrentHashMap<>();
    private final ExecutorService clientExecutor = Executors.newCachedThreadPool();
    private ServerSocket serverSocket;
    private volatile int port = -1;
    private volatile boolean started = false;
    private volatile String cachedVisitorData = "";
    private volatile long visitorDataExpiresAtMs = 0L;

    private LocalAudioStreamProxy() {
        this.httpClient = new OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .followRedirects(true)
            .build();
    }

    public static synchronized LocalAudioStreamProxy getInstance() {
        if (instance == null) {
            instance = new LocalAudioStreamProxy();
        }
        instance.ensureStarted();
        return instance;
    }

    private synchronized void ensureStarted() {
        if (started && serverSocket != null && !serverSocket.isClosed() && port > 0) {
            return;
        }
        try {
            serverSocket = new ServerSocket(0, 32, InetAddress.getByName("127.0.0.1"));
            port = serverSocket.getLocalPort();
            started = true;
            Thread acceptThread = new Thread(() -> {
                while (started && serverSocket != null && !serverSocket.isClosed()) {
                    try {
                        Socket socket = serverSocket.accept();
                        clientExecutor.submit(() -> handleSocket(socket));
                    } catch (IOException e) {
                        if (!started) break;
                    }
                }
            }, "SoundClearAudioProxy");
            acceptThread.setDaemon(true);
            acceptThread.start();
        } catch (IOException ignored) {
            started = false;
            port = -1;
        }
    }

    public ResolvedAudioResult resolveForVideo(String rawVideoId) {
        if (TextUtils.isEmpty(rawVideoId)) return null;
        String videoId = rawVideoId.trim();
        ensureStarted();
        if (port <= 0) return null;

        CachedStream cached = cache.get(videoId);
        if (cached == null || cached.isExpired()) {
            cached = resolveViaInnerTube(videoId);
            if (cached != null) {
                cache.put(videoId, cached);
            }
        }
        if (cached == null) return null;

        String proxyUrl = String.format(
            Locale.US,
            "http://127.0.0.1:%d/stream?id=%s",
            port,
            videoId
        );
        return new ResolvedAudioResult(proxyUrl, cached.mimeType, cached.bitrateKbps, cached.codec);
    }

    private String getVisitorData() {
        long now = System.currentTimeMillis();
        if (!TextUtils.isEmpty(cachedVisitorData) && now < visitorDataExpiresAtMs) {
            return cachedVisitorData;
        }
        try {
            Request req = new Request.Builder()
                .url("https://www.youtube.com/sw.js_data")
                .header("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36")
                .build();
            try (Response res = httpClient.newCall(req).execute()) {
                ResponseBody body = res.body();
                if (res.isSuccessful() && body != null) {
                    String raw = body.string();
                    int idx = raw.indexOf("\"Cg");
                    if (idx >= 0) {
                        int end = raw.indexOf('"', idx + 1);
                        if (end > idx + 3) {
                            String candidate = raw.substring(idx + 1, end);
                            if (candidate.length() >= 10 && candidate.length() <= 128) {
                                cachedVisitorData = candidate;
                                visitorDataExpiresAtMs = now + 30L * 60L * 1000L;
                                return cachedVisitorData;
                            }
                        }
                    }
                }
            }
        } catch (Exception ignored) {
            // Optional visitorData
        }
        return cachedVisitorData;
    }

    private CachedStream resolveViaInnerTube(String videoId) {
        String visitorData = getVisitorData();
        for (ClientProfile client : CLIENTS) {
            try {
                JSONObject clientJson = new JSONObject();
                clientJson.put("clientName", client.name);
                clientJson.put("clientVersion", client.version);
                clientJson.put("hl", "id");
                clientJson.put("gl", "ID");
                if (!TextUtils.isEmpty(visitorData)) {
                    clientJson.put("visitorData", visitorData);
                }
                if (client.name.startsWith("ANDROID")) {
                    clientJson.put("androidSdkVersion", 34);
                } else if ("IOS".equals(client.name)) {
                    clientJson.put("deviceMake", "Apple");
                    clientJson.put("deviceModel", "iPhone16,2");
                    clientJson.put("osName", "iPhone");
                    clientJson.put("osVersion", "18.3.2.22D82");
                }

                JSONObject contextJson = new JSONObject();
                contextJson.put("client", clientJson);

                JSONObject payload = new JSONObject();
                payload.put("context", contextJson);
                payload.put("videoId", videoId);
                payload.put("contentCheckOk", true);
                payload.put("racyCheckOk", true);

                Request.Builder reqBuilder = new Request.Builder()
                    .url(client.origin + "/youtubei/v1/player?prettyPrint=false")
                    .post(RequestBody.create(payload.toString(), JSON_MEDIA_TYPE))
                    .header("Content-Type", "application/json")
                    .header("Origin", client.origin)
                    .header("User-Agent", client.userAgent)
                    .header("X-YouTube-Client-Name", client.clientId)
                    .header("X-YouTube-Client-Version", client.version);
                if (!TextUtils.isEmpty(visitorData)) {
                    reqBuilder.header("X-Goog-Visitor-Id", visitorData);
                }
                Request req = reqBuilder.build();

                try (Response res = httpClient.newCall(req).execute()) {
                    if (!res.isSuccessful()) continue;
                    ResponseBody body = res.body();
                    if (body == null) continue;
                    String raw = body.string();
                    JSONObject json = new JSONObject(raw);
                    JSONObject playability = json.optJSONObject("playabilityStatus");
                    if (playability != null && !"OK".equals(playability.optString("status", ""))) {
                        continue;
                    }
                    JSONObject streamingData = json.optJSONObject("streamingData");
                    if (streamingData == null) continue;

                    List<JSONObject> candidates = new ArrayList<>();
                    JSONArray adaptive = streamingData.optJSONArray("adaptiveFormats");
                    if (adaptive != null) {
                        for (int i = 0; i < adaptive.length(); i++) {
                            JSONObject fmt = adaptive.optJSONObject(i);
                            if (fmt != null) candidates.add(fmt);
                        }
                    }
                    JSONArray formats = streamingData.optJSONArray("formats");
                    if (formats != null) {
                        for (int i = 0; i < formats.length(); i++) {
                            JSONObject fmt = formats.optJSONObject(i);
                            if (fmt != null) candidates.add(fmt);
                        }
                    }

                    List<JSONObject> audioOnly = new ArrayList<>();
                    for (JSONObject fmt : candidates) {
                        String url = fmt.optString("url", "");
                        String mime = fmt.optString("mimeType", "");
                        if (!TextUtils.isEmpty(url) && mime.startsWith("audio/")) {
                            audioOnly.add(fmt);
                        }
                    }

                    audioOnly.sort(
                        Comparator
                            .comparing((JSONObject fmt) -> fmt.optString("mimeType", "").contains("mp4a"))
                            .reversed()
                            .thenComparingInt((JSONObject fmt) -> fmt.optInt("bitrate", 0))
                            .reversed()
                    );

                    JSONObject best = audioOnly.isEmpty() ? null : audioOnly.get(0);
                    if (best == null) {
                        for (JSONObject fmt : candidates) {
                            if (!TextUtils.isEmpty(fmt.optString("url", ""))) {
                                best = fmt;
                                break;
                            }
                        }
                    }

                    if (best != null) {
                        String streamUrl = best.optString("url", "");
                        if (!TextUtils.isEmpty(streamUrl)) {
                            String rawMime = best.optString("mimeType", "audio/mp4");
                            String cleanMime = rawMime.contains(";")
                                ? rawMime.substring(0, rawMime.indexOf(';')).trim()
                                : rawMime.trim();
                            int bitrateKbps = Math.max(64, best.optInt("bitrate", 128000) / 1000);
                            String codec = rawMime.contains("opus")
                                ? "Opus"
                                : rawMime.contains("mp4a")
                                    ? "AAC"
                                    : "M4A";
                            return new CachedStream(
                                streamUrl,
                                client.userAgent,
                                cleanMime.isEmpty() ? "audio/mp4" : cleanMime,
                                bitrateKbps,
                                codec,
                                System.currentTimeMillis() + STREAM_CACHE_TTL_MS
                            );
                        }
                    }
                }
            } catch (Exception ignored) {
                // Try next InnerTube client profile
            }
        }
        return null;
    }

    private void handleSocket(Socket socket) {
        try (Socket s = socket) {
            s.setSoTimeout(30_000);
            BufferedInputStream in = new BufferedInputStream(s.getInputStream());
            BufferedReader reader = new BufferedReader(
                new InputStreamReader(in, StandardCharsets.US_ASCII)
            );
            OutputStream out = s.getOutputStream();

            String requestLine = reader.readLine();
            if (requestLine == null || requestLine.isEmpty()) return;

            String[] parts = requestLine.split(" ");
            if (parts.length < 2) return;
            String method = parts[0].toUpperCase(Locale.US);
            String target = parts[1];

            String rangeHeader = null;
            String line;
            while ((line = reader.readLine()) != null && !line.isEmpty()) {
                int colon = line.indexOf(':');
                if (colon > 0) {
                    String name = line.substring(0, colon).trim().toLowerCase(Locale.US);
                    String val = line.substring(colon + 1).trim();
                    if ("range".equals(name)) {
                        rangeHeader = val;
                    }
                }
            }

            if ("OPTIONS".equals(method)) {
                writeSimpleResponse(out, 204, "No Content", "text/plain", new byte[0]);
                return;
            }

            if (!"GET".equals(method) && !"HEAD".equals(method)) {
                writeSimpleResponse(out, 405, "Method Not Allowed", "text/plain", new byte[0]);
                return;
            }

            String videoId = extractQueryParam(target, "id");
            if (TextUtils.isEmpty(videoId)) {
                writeSimpleResponse(out, 400, "Bad Request", "text/plain", new byte[0]);
                return;
            }

            CachedStream stream = cache.get(videoId);
            if (stream == null || stream.isExpired()) {
                stream = resolveViaInnerTube(videoId);
                if (stream != null) {
                    cache.put(videoId, stream);
                }
            }

            if (stream == null) {
                writeSimpleResponse(out, 502, "Bad Gateway", "text/plain", new byte[0]);
                return;
            }

            Request.Builder reqBuilder = new Request.Builder()
                .url(stream.upstreamUrl)
                .header("Accept-Encoding", "identity")
                .header("User-Agent", stream.userAgent);
            if (rangeHeader != null && !rangeHeader.isEmpty()) {
                reqBuilder.header("Range", rangeHeader);
            }
            if ("HEAD".equals(method)) {
                reqBuilder.head();
            }

            Response upstreamRes = httpClient.newCall(reqBuilder.build()).execute();
            if (upstreamRes.code() == 403 || upstreamRes.code() == 410) {
                upstreamRes.close();
                cache.remove(videoId);
                stream = resolveViaInnerTube(videoId);
                if (stream == null) {
                    writeSimpleResponse(out, 502, "Bad Gateway", "text/plain", new byte[0]);
                    return;
                }
                cache.put(videoId, stream);
                Request.Builder retryBuilder = new Request.Builder()
                    .url(stream.upstreamUrl)
                    .header("Accept-Encoding", "identity")
                    .header("User-Agent", stream.userAgent);
                if (rangeHeader != null && !rangeHeader.isEmpty()) {
                    retryBuilder.header("Range", rangeHeader);
                }
                if ("HEAD".equals(method)) {
                    retryBuilder.head();
                }
                upstreamRes = httpClient.newCall(retryBuilder.build()).execute();
            }

            try (Response upstream = upstreamRes) {
                int statusCode = upstream.code();
                String statusMsg = upstream.message().isEmpty()
                    ? (statusCode == 206 ? "Partial Content" : "OK")
                    : upstream.message();
                String contentType = upstream.header("Content-Type", stream.mimeType);
                String contentLength = upstream.header("Content-Length");
                String contentRange = upstream.header("Content-Range");
                String acceptRanges = upstream.header("Accept-Ranges", "bytes");

                StringBuilder headers = new StringBuilder();
                headers.append("HTTP/1.1 ").append(statusCode).append(' ').append(statusMsg).append("\r\n");
                headers.append("Content-Type: ").append(contentType).append("\r\n");
                headers.append("Accept-Ranges: ").append(acceptRanges).append("\r\n");
                headers.append("Access-Control-Allow-Origin: *\r\n");
                headers.append("Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n");
                headers.append("Access-Control-Allow-Headers: Range, Content-Type\r\n");
                headers.append("Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges\r\n");
                if (contentLength != null) {
                    headers.append("Content-Length: ").append(contentLength).append("\r\n");
                }
                if (contentRange != null) {
                    headers.append("Content-Range: ").append(contentRange).append("\r\n");
                }
                headers.append("Connection: close\r\n\r\n");
                out.write(headers.toString().getBytes(StandardCharsets.US_ASCII));

                if (!"HEAD".equals(method)) {
                    ResponseBody body = upstream.body();
                    if (body != null) {
                        InputStream upstreamIn = body.byteStream();
                        byte[] buf = new byte[16384];
                        int read;
                        while ((read = upstreamIn.read(buf)) != -1) {
                            out.write(buf, 0, read);
                        }
                    }
                }
                out.flush();
            }
        } catch (Exception ignored) {
            // Connection closed by client/audio element during seek or track switch
        }
    }

    private static String extractQueryParam(String target, String key) {
        int qIdx = target.indexOf('?');
        if (qIdx < 0 || qIdx >= target.length() - 1) return null;
        String query = target.substring(qIdx + 1);
        for (String pair : query.split("&")) {
            int eq = pair.indexOf('=');
            if (eq > 0) {
                String k = URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8);
                if (key.equals(k)) {
                    return URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8);
                }
            }
        }
        return null;
    }

    private static void writeSimpleResponse(
        OutputStream out,
        int code,
        String msg,
        String contentType,
        byte[] body
    ) throws IOException {
        ByteArrayOutputStream headerBytes = new ByteArrayOutputStream();
        String headers =
            "HTTP/1.1 " + code + " " + msg + "\r\n" +
            "Content-Type: " + contentType + "\r\n" +
            "Content-Length: " + body.length + "\r\n" +
            "Access-Control-Allow-Origin: *\r\n" +
            "Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n" +
            "Access-Control-Allow-Headers: Range, Content-Type\r\n" +
            "Connection: close\r\n\r\n";
        headerBytes.write(headers.getBytes(StandardCharsets.US_ASCII));
        headerBytes.write(body);
        out.write(headerBytes.toByteArray());
        out.flush();
    }
}
