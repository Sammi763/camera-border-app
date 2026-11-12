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
    /** 底片数字化能力；T03 起由真实随包 helper 探测填充。 */
    private FilmDigitizationCapability filmDigitization = new FilmDigitizationCapability();

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
    public FilmDigitizationCapability getFilmDigitization() { return filmDigitization; }
    public void setFilmDigitization(final FilmDigitizationCapability filmDigitization) {
        this.filmDigitization = filmDigitization;
    }

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

    /** 底片数字化能力；缺少 helper/版本/架构不符时必须 available=false 并给出原因。 */
    public static final class FilmDigitizationCapability {
        private boolean available;
        private String decoder;
        private String version;
        private String license;
        private String sha256;
        private java.util.List<String> inputModes = new java.util.ArrayList<>();
        private java.util.List<String> analysisStages = new java.util.ArrayList<>();
        private Map<String, Boolean> outputs = new LinkedHashMap<>();
        private String reason;

        public boolean isAvailable() { return available; }
        public void setAvailable(final boolean available) { this.available = available; }
        public String getDecoder() { return decoder; }
        public void setDecoder(final String decoder) { this.decoder = decoder; }
        public String getVersion() { return version; }
        public void setVersion(final String version) { this.version = version; }
        public String getLicense() { return license; }
        public void setLicense(final String license) { this.license = license; }
        public String getSha256() { return sha256; }
        public void setSha256(final String sha256) { this.sha256 = sha256; }
        public java.util.List<String> getInputModes() { return inputModes; }
        public void setInputModes(final java.util.List<String> inputModes) {
            this.inputModes = inputModes == null ? new java.util.ArrayList<>() : inputModes;
        }
        public java.util.List<String> getAnalysisStages() { return analysisStages; }
        public void setAnalysisStages(final java.util.List<String> analysisStages) {
            this.analysisStages = analysisStages == null ? new java.util.ArrayList<>() : analysisStages;
        }
        public Map<String, Boolean> getOutputs() { return outputs; }
        public void setOutputs(final Map<String, Boolean> outputs) {
            this.outputs = outputs == null ? new LinkedHashMap<>() : outputs;
        }
        public String getReason() { return reason; }
        public void setReason(final String reason) { this.reason = reason; }
    }
}
