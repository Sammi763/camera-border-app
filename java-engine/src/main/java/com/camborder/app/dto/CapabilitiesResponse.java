package com.camborder.app.dto;

import java.util.LinkedHashMap;
import java.util.Map;

/** 运行时能力快照；只描述当前进程实际可用的能力，不泄露外部工具路径。 */
public final class CapabilitiesResponse {

    private int schemaVersion = 1;
    private Map<String, Component> components = new LinkedHashMap<>();
    private Map<String, Boolean> input = new LinkedHashMap<>();
    private Map<String, FormatCapability> output = new LinkedHashMap<>();
    private Map<String, TierCapability> tiers = new LinkedHashMap<>();

    public int getSchemaVersion() { return schemaVersion; }
    public void setSchemaVersion(final int schemaVersion) { this.schemaVersion = schemaVersion; }
    public Map<String, Component> getComponents() { return components; }
    public void setComponents(final Map<String, Component> components) { this.components = components; }
    public Map<String, Boolean> getInput() { return input; }
    public void setInput(final Map<String, Boolean> input) { this.input = input; }
    public Map<String, FormatCapability> getOutput() { return output; }
    public void setOutput(final Map<String, FormatCapability> output) { this.output = output; }
    public Map<String, TierCapability> getTiers() { return tiers; }
    public void setTiers(final Map<String, TierCapability> tiers) { this.tiers = tiers; }

    public static final class Component {
        private boolean available;
        private String version;
        private String license;
        private String sha256;
        private String reason;

        public Component() { }

        public Component(final boolean available, final String version, final String license,
                         final String sha256, final String reason) {
            this.available = available;
            this.version = version;
            this.license = license;
            this.sha256 = sha256;
            this.reason = reason;
        }

        public boolean isAvailable() { return available; }
        public void setAvailable(final boolean available) { this.available = available; }
        public String getVersion() { return version; }
        public void setVersion(final String version) { this.version = version; }
        public String getLicense() { return license; }
        public void setLicense(final String license) { this.license = license; }
        public String getSha256() { return sha256; }
        public void setSha256(final String sha256) { this.sha256 = sha256; }
        public String getReason() { return reason; }
        public void setReason(final String reason) { this.reason = reason; }
    }

    public static final class FormatCapability {
        private boolean available;
        private int[] bitDepths = new int[0];
        private boolean icc;
        private boolean exif;
        private boolean xmp;
        private boolean iptc;
        private boolean gps;
        private boolean dpi;
        private String reason;

        public boolean isAvailable() { return available; }
        public void setAvailable(final boolean available) { this.available = available; }
        public int[] getBitDepths() { return bitDepths; }
        public void setBitDepths(final int[] bitDepths) { this.bitDepths = bitDepths == null ? new int[0] : bitDepths; }
        public boolean isIcc() { return icc; }
        public void setIcc(final boolean icc) { this.icc = icc; }
        public boolean isExif() { return exif; }
        public void setExif(final boolean exif) { this.exif = exif; }
        public boolean isXmp() { return xmp; }
        public void setXmp(final boolean xmp) { this.xmp = xmp; }
        public boolean isIptc() { return iptc; }
        public void setIptc(final boolean iptc) { this.iptc = iptc; }
        public boolean isGps() { return gps; }
        public void setGps(final boolean gps) { this.gps = gps; }
        public boolean isDpi() { return dpi; }
        public void setDpi(final boolean dpi) { this.dpi = dpi; }
        public String getReason() { return reason; }
        public void setReason(final String reason) { this.reason = reason; }
    }

    public static final class TierCapability {
        private boolean available;
        private String defaultFormat;
        private String reason;

        public TierCapability() { }

        public TierCapability(final boolean available, final String defaultFormat, final String reason) {
            this.available = available;
            this.defaultFormat = defaultFormat;
            this.reason = reason;
        }

        public boolean isAvailable() { return available; }
        public void setAvailable(final boolean available) { this.available = available; }
        public String getDefaultFormat() { return defaultFormat; }
        public void setDefaultFormat(final String defaultFormat) { this.defaultFormat = defaultFormat; }
        public String getReason() { return reason; }
        public void setReason(final String reason) { this.reason = reason; }
    }
}
