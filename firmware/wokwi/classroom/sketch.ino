#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <DHTesp.h>
#include <ESP32Servo.h>
#include <ArduinoJson.h>
#include <esp_system.h>
#include <driver/gpio.h>
#include <math.h>
#include <time.h>

// BEGIN TRUSTED CA BUNDLE (generated from certs/roots.pem; public certificates)
static const char TRUSTED_CA[] PROGMEM=R"CLIMATE_CA(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAwTzELMAkG
A1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2VhcmNoIEdyb3VwMRUw
EwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4WhcNMzUwNjA0MTEwNDM4WjBP
MQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJuZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3Jv
dXAxFTATBgNVBAMTDElTUkcgUm9vdCBYMTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoC
ggIBAK3oJHP0FDfzm54rVygch77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj
/RQSa78f0uoxmyF+0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7i
S4+3mX6UA5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyHB5T0Y3Hs
LuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UCB5iPNgiV5+I3lg02
dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUvKBds0pjBqAlkd25HN7rOrFle
aJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWnOlFuhjuefXKnEgV4We0+UXgVCwOPjdAv
BbI+e0ocS3MFEvzG6uBQE3xDk3SzynTnjh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymC
zLq9gwQbooMDQaHWBfEbwrbwqHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC
1CLQJ13hef4Y53CIrU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIB
BjAPBgNVHRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZLubhzEFnT
IZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ3BebYhtF8GaV0nxv
wuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KKNFtY2PwByVS5uCbMiogziUwt
hDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5ORAzI4JMPJ+GslWYHb4phowim57iaztX
OoJwTdwJx4nLCgdNbOhdjsnvzqvHu7UrTkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIu
vtd7u+Nxe5AW0wdeRlN8NwdCjNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1N
bdWhscdCb+ZAJzVcoyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4k
qKOJ2qxq4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57demyPxgcY
xn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIICGzCCAaGgAwIBAgIQQdKd0XLq7qeAwSxs6S+HUjAKBggqhkjOPQQDAzBPMQswCQYDVQQG
EwJVUzEpMCcGA1UEChMgSW50ZXJuZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNV
BAMTDElTUkcgUm9vdCBYMjAeFw0yMDA5MDQwMDAwMDBaFw00MDA5MTcxNjAwMDBaME8xCzAJ
BgNVBAYTAlVTMSkwJwYDVQQKEyBJbnRlcm5ldCBTZWN1cml0eSBSZXNlYXJjaCBHcm91cDEV
MBMGA1UEAxMMSVNSRyBSb290IFgyMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAEzZvVn4CDCuwJ
SvMWSj5cz3es3mcFDR0HttwW+1qLFNvicWDEukWVEYmO6gbf9yoWHKS5xcUy4APgHoIYOIvX
RdgKam7mAHf7AlF9ItgKbppbd9/w+kHsOdx1ymgHDB/qo0IwQDAOBgNVHQ8BAf8EBAMCAQYw
DwYDVR0TAQH/BAUwAwEB/zAdBgNVHQ4EFgQUfEKWrt5LSDv6kviejM9ti6lyN5UwCgYIKoZI
zj0EAwMDaAAwZQIwe3lORlCEwkSHRhtFcP9Ymd70/aTSVaYgLXTWNLxBo1BfASdWtL4ndQav
Ei51mI38AjEAi/V3bNTIZargCyzuFJ0nN6T5U6VR5CmD1/iQMVtCnwr1/q4AaOeMSQ+2b1tb
FfLn
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIFVzCCAz+gAwIBAgINAgPlk28xsBNJiGuiFzANBgkqhkiG9w0BAQwFADBHMQswCQYDVQQG
EwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEUMBIGA1UEAxMLR1RT
IFJvb3QgUjEwHhcNMTYwNjIyMDAwMDAwWhcNMzYwNjIyMDAwMDAwWjBHMQswCQYDVQQGEwJV
UzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEUMBIGA1UEAxMLR1RTIFJv
b3QgUjEwggIiMA0GCSqGSIb3DQEBAQUAA4ICDwAwggIKAoICAQC2EQKLHuOhd5s73L+UPreV
p0A8of2C+X0yBoJx9vaMf/vo27xqLpeXo4xL+Sv2sfnOhB2x+cWX3u+58qPpvBKJXqeqUqv4
IyfLpLGcY9vXmX7wCl7raKb0xlpHDU0QM+NOsROjyBhsS+z8CZDfnWQpJSMHobTSPS5g4M/S
CYe7zUjwTcLCeoiKu7rPWRnWr4+wB7CeMfGCwcDfLqZtbBkOtdh+JhpFAz2weaSUKK0Pfybl
qAj+lug8aJRT7oM6iCsVlgmy4HqMLnXWnOunVmSPlk9orj2XwoSPwLxAwAtcvfaHszVsrBhQ
f4TgTM2S0yDpM7xSma8ytSmzJSq0SPly4cpk9+aCEI3oncKKiPo4Zor8Y/kB+Xj9e1x3+naH
+uzfsQ55lVe0vSbv1gHR6xYKu44LtcXFilWr06zqkUspzBmkMiVOKvFlRNACzqrOSbTqn3yD
sEB750Orp2yjj32JgfpMpf/VjsPOS+C12LOORc92wO1AK/1TD7Cn1TsNsYqiA94xrcx36m97
PtbfkSIS5r762DL8EGMUUXLeXdYWk70paDPvOmbsB4om3xPXV2V4J95eSRQAogB/mqghtqmx
lbCluQ0WEdrHbEg8QOB+DVrNVjzRlwW5y0vtOUucxD/SVRNuJLDWcfr0wbrM7Rv1/oFB2ACY
PTrIrnqYNxgFlQIDAQABo0IwQDAOBgNVHQ8BAf8EBAMCAYYwDwYDVR0TAQH/BAUwAwEB/zAd
BgNVHQ4EFgQU5K8rJnEaK0gnhS9SZizv8IkTcT4wDQYJKoZIhvcNAQEMBQADggIBAJ+qQibb
C5u+/x6Wki4+omVKapi6Ist9wTrYggoGxval3sBOh2Z5ofmmWJyq+bXmYOfg6LEeQkEzCzc9
zolwFcq1JKjPa7XSQCGYzyI0zzvFIoTgxQ6KfF2I5DUkzps+GlQebtuyh6f88/qBVRRiClmp
IgUxPoLW7ttXNLwzldMXG+gnoot7TiYaelpkttGsN/H9oPM47HLwEXWdyzRSjeZ2axfG34ar
J45JK3VmgRAhpuo+9K4l/3wV3s6MJT/KYnAK9y8JZgfIPxz88NtFMN9iiMG1D53Dn0reWVlH
xYciNuaCp+0KueIHoI17eko8cdLiA6EfMgfdG+RCzgwARWGAtQsgWSl4vflVy2PFPEz0tv/b
al8xa5meLMFrUKTX5hgUvYU/Z6tGn6D/Qqc6f1zLXbBwHSs09dR2CQzreExZBfMzQsNhFRAb
d03OIozUhfJFfbdT6u9AWpQKXCBfTkBdYiJ23//OYb2MI3jSNwLgjt7RETeJ9r/tSQdirpLs
QBqvFAnZ0E6yove+7u7Y/9waLd64NnHi/Hm3lCXRSHNboTXns5lndcEZOitHTtNCjv0xyBZm
2tIMPNuzjsmhDYAPexZ3FL//2wmUspO8IFgV6dtxQ/PeEMMA3KgqlbbC1j+Qa3bbbP6MvPJw
NQzcmRk13NfIRmPVNnGuV/u3gm3c
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIFVzCCAz+gAwIBAgINAgPlrsWNBCUaqxElqjANBgkqhkiG9w0BAQwFADBHMQswCQYDVQQG
EwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEUMBIGA1UEAxMLR1RT
IFJvb3QgUjIwHhcNMTYwNjIyMDAwMDAwWhcNMzYwNjIyMDAwMDAwWjBHMQswCQYDVQQGEwJV
UzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEUMBIGA1UEAxMLR1RTIFJv
b3QgUjIwggIiMA0GCSqGSIb3DQEBAQUAA4ICDwAwggIKAoICAQDO3v2m++zsFDQ8BwZabFn3
GTXd98GdVarTzTukk3LvCvptnfbwhYBboUhSnznFt+4orO/LdmgUud+tAWyZH8QiHZ/+cnfg
LFuv5AS/T3KgGjSY6Dlo7JUle3ah5mm5hRm9iYz+re026nO8/4Piy33B0s5Ks40FnotJk9/B
W9BuXvAuMC6C/Pq8tBcKSOWIm8Wba96wyrQD8Nr0kLhlZPdcTK3ofmZemde4wj7I0BOdre7k
RXuJVfeKH2JShBKzwkCX44ofR5GmdFrS+LFjKBC4swm4VndAoiaYecb+3yXuPuWgf9RhD1FL
PD+M2uFwdNjCaKH5wQzpoeJ/u1U8dgbuak7MkogwTZq9TwtImoS1mKPV+3PBV2HdKFZ1E66H
jucMUQkQdYhMvI35ezzUIkgfKtzra7tEscszcTJGr61K8YzodDqs5xoic4DSMPclQsciOzsS
rZYuxsN2B6ogtzVJV+mSSeh2FnIxZyuWfoqjx5RWIr9qS34BIbIjMt/kmkRtWVtd9QCgHJvG
eJeNkP+byKq0rxFROV7Z+2et1VsRnTKaG73VululycslaVNVJ1zgyjbLiGH7HrfQy+4W+9Om
TN6SpdTi3/UGVN4unUu0kzCqgc7dGtxRcw1PcOnlthYhGXmy5okLdWTK1au8CcEYof/UVKGF
PP0UJAOyh9OktwIDAQABo0IwQDAOBgNVHQ8BAf8EBAMCAYYwDwYDVR0TAQH/BAUwAwEB/zAd
BgNVHQ4EFgQUu//KjiOfT5nK2+JopqUVJxce2Q4wDQYJKoZIhvcNAQEMBQADggIBAB/Kzt3H
vqGf2SdMC9wXmBFqiN495nFWcrKeGk6c1SuYJF2ba3uwM4IJvd8lRuqYnrYb/oM80mJhwQTt
zuDFycgTE1XnqGOtjHsB/ncw4c5omwX4Eu55MaBBRTUoCnGkJE+M3DyCB19m3H0Q/gxhswWV
7uGugQ+o+MePTagjAiZrHYNSVc61LwDKgEDg4XSsYPWHgJ2uNmSRXbBoGOqKYcl3qJfEycel
/FVL8/B/uWU9J2jQzGv6U53hkRrJXRqWbTKH7QMgyALOWr7Z6v2yTcQvG99fevX4i8buMTol
UVVnjWQye+mew4K6Ki3pHrTgSAai/GevHyICc/sgCq+dVEuhzf9gR7A/Xe8bVr2XIZYtCtFe
nTgCR2y59PYjJbigapordwj6xLEokCZYCDzifqrXPW+6MYgKBesntaFJ7qBFVHvmJ2WZICGo
o7z7GJa7Um8M7YNRTOlZ4iBgxcJlkoKM8xAfDoqXvneCbT+PHV28SSe9zE8P4c52hgQjxcCM
Elv924SgJPFI/2R80L5cFtHvma3AH/vLrrw4IgYmZNralw4/KBVEqE8AyvCazM90arQ+POuV
7LXTWtiBmelDGDfrs7vRWGJB82bSj6p4lVQgw1oudCvV0b4YacCs1aTPObpRhANl6WLAYv7Y
TVWW4tAR+kg0Eeye7QUd5MjWHYbL
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIICCTCCAY6gAwIBAgINAgPluILrIPglJ209ZjAKBggqhkjOPQQDAzBHMQswCQYDVQQGEwJV
UzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEUMBIGA1UEAxMLR1RTIFJv
b3QgUjMwHhcNMTYwNjIyMDAwMDAwWhcNMzYwNjIyMDAwMDAwWjBHMQswCQYDVQQGEwJVUzEi
MCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEUMBIGA1UEAxMLR1RTIFJvb3Qg
UjMwdjAQBgcqhkjOPQIBBgUrgQQAIgNiAAQfTzOHMymKoYTey8chWEGJ6ladK0uFxh1MJ7x/
JlFyb+Kf1qPKzEUURout736GjOyxfi//qXGdGIRFBEFVbivqJn+7kAHjSxm65FSWRQmx1WyR
RK2EE46ajA2ADDL24CejQjBAMA4GA1UdDwEB/wQEAwIBhjAPBgNVHRMBAf8EBTADAQH/MB0G
A1UdDgQWBBTB8Sa6oC2uhYHP0/EqEr24Cmf9vDAKBggqhkjOPQQDAwNpADBmAjEA9uEglRR7
VKOQFhG/hMjqb2sXnh5GmCCbn9MN2azTL818+FsuVbu/3ZL3pAzcMeGiAjEA/JdmZuVDFhOD
3cffL74UOO0BzrEXGhF16b0DjyZ+hOXJYKaV11RZt+cRLInUue4X
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIICCTCCAY6gAwIBAgINAgPlwGjvYxqccpBQUjAKBggqhkjOPQQDAzBHMQswCQYDVQQGEwJV
UzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEUMBIGA1UEAxMLR1RTIFJv
b3QgUjQwHhcNMTYwNjIyMDAwMDAwWhcNMzYwNjIyMDAwMDAwWjBHMQswCQYDVQQGEwJVUzEi
MCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEUMBIGA1UEAxMLR1RTIFJvb3Qg
UjQwdjAQBgcqhkjOPQIBBgUrgQQAIgNiAATzdHOnaItgrkO4NcWBMHtLSZ37wWHO5t5GvWvV
YRg1rkDdc/eJkTBa6zzuhXyiQHY7qca4R9gq55KRanPpsXI5nymfopjTX15YhmUPoYRlBtHc
i8nHc8iMai/lxKvRHYqjQjBAMA4GA1UdDwEB/wQEAwIBhjAPBgNVHRMBAf8EBTADAQH/MB0G
A1UdDgQWBBSATNbrdP9JNqPV2Py1PsVq8JQdjDAKBggqhkjOPQQDAwNpADBmAjEA6ED/g94D
9J+uHXqnLrmvT/aDHQ4thQEd0dlq7A/Cr8deVl5c1RxYIigL9zC2L7F8AjEA8GE8p/SgguMh
1YQdc4acLa/KNJvxn7kjNuK8YAOdgLOaVsjh4rsUecrNIdSUtUlD
-----END CERTIFICATE-----
)CLIMATE_CA";
// END TRUSTED CA BUNDLE

// Existing GPIO mapping. Pump relay and tank interlock use two spare pins.
constexpr int DHT_PIN=4, CO2_PIN=34, PM25_PIN=35, PCM_PIN=32;
constexpr int LDR_PIN=33, PIR_PIN=27, FAN_PIN=25, HVAC_PIN=26;
constexpr int SERVO_PIN=23, PUMP_PIN=22, TANK_PIN=21;
constexpr float DEFAULT_SETPOINT=26.7f, HYSTERESIS=0.5f;
constexpr int RELAY_ON=HIGH, RELAY_OFF=LOW; // Explicit npn / active-high Wokwi relay
constexpr bool ROOM_ACTUATORS=true;
constexpr char LOCATION_ID[]="classroom";
constexpr char DEVICE_ID[]="climate-classroom-esp32";
constexpr char FIRMWARE[]="climate-wokwi-3.0";

Servo vent;
struct Sample {
  float temperature, humidity, co2, pm25, pcm, lux, setpoint;
  bool sensorOk, tankOk, occupancy, fan, pump, hvac;
  int angle;
};
struct Connection { char url[220]; char token[128]; }; // cs_UUID_64hex requires 104 characters
QueueHandle_t samples, connections;
portMUX_TYPE configMux=portMUX_INITIALIZER_UNLOCKED;
float requestedSetpoint=DEFAULT_SETPOINT;
bool cooling=false;
String serialLine;

// Keep GPIO4 in open-drain mode: switching pinMode during the DHT response
// misses its acknowledgement with the current Wokwi Arduino runtime.
// Decode the actual 40 sensor bits and verify checksum; never substitute data.
portMUX_TYPE dhtMux=portMUX_INITIALIZER_UNLOCKED;
bool waitDhtLevel(int level, uint32_t timeoutUs=150) {
  const uint32_t start=micros();
  while (gpio_get_level((gpio_num_t)DHT_PIN)==level)
    if (micros()-start>timeoutUs) return false;
  return true;
}
TempAndHumidity readDht22() {
  TempAndHumidity result={NAN,NAN}; uint8_t bytes[5]={};
  gpio_set_level((gpio_num_t)DHT_PIN,0); delay(2);
  portENTER_CRITICAL(&dhtMux);
  gpio_set_level((gpio_num_t)DHT_PIN,1);
  bool ok=waitDhtLevel(1)&&waitDhtLevel(0)&&waitDhtLevel(1);
  for (int i=0;ok && i<40;i++) {
    ok=waitDhtLevel(0); const uint32_t start=micros();
    if (ok) ok=waitDhtLevel(1);
    bytes[i/8]=(bytes[i/8]<<1)|((micros()-start)>50);
  }
  portEXIT_CRITICAL(&dhtMux);
  if (!ok || uint8_t(bytes[0]+bytes[1]+bytes[2]+bytes[3])!=bytes[4]) return result;
  const float rh=((bytes[0]<<8)|bytes[1])*0.1f;
  const float t=(((bytes[2]&0x7f)<<8)|bytes[3])*0.1f*(bytes[2]&0x80?-1:1);
  if (rh>=0 && rh<=100 && t>=-40 && t<=80) { result.temperature=t; result.humidity=rh; }
  return result;
}

float mapAnalog(int pin, float low, float high) {
  return low + (high-low) * analogRead(pin) / 4095.0f;
}
float readLux() {
  // Wokwi photoresistor module: RL10=50 kOhm, gamma=0.7, divider R=10 kOhm.
  const float ratio=constrain(analogRead(LDR_PIN)/4095.0f, 0.0001f, 0.9999f);
  const float resistance=10000.0f*ratio/(1.0f-ratio);
  return constrain(powf(50000.0f*powf(10.0f,0.7f)/resistance, 1.0f/0.7f), 0.0f, 100000.0f);
}
String newMessageId() {
  uint8_t b[16]; for (auto &v:b) v=(uint8_t)esp_random();
  b[6]=(b[6]&15)|64; b[8]=(b[8]&63)|128;
  char out[37];
  snprintf(out,sizeof(out),"%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
    b[0],b[1],b[2],b[3],b[4],b[5],b[6],b[7],b[8],b[9],b[10],b[11],b[12],b[13],b[14],b[15]);
  return String(out);
}
void networkTask(void*) {
  Connection config={}; Sample s;
  WiFi.mode(WIFI_STA); WiFi.begin("Wokwi-GUEST","",6);
  configTime(0,0,"pool.ntp.org","time.google.com");
  unsigned long lastReconnect=0;
  for (;;) {
    Connection next;
    if (xQueueReceive(connections,&next,0)==pdTRUE) config=next;
    if (xQueueReceive(samples,&s,pdMS_TO_TICKS(500))!=pdTRUE) continue;
    if (WiFi.status()!=WL_CONNECTED) {
      if (millis()-lastReconnect>15000) { WiFi.reconnect(); lastReconnect=millis(); }
      Serial.println("WiFi: menghubungkan Wokwi-GUEST"); continue;
    }
    if (!config.url[0]) { Serial.println("WiFi OK. Web belum dihubungkan; kirim CONNECT <https-url> <token> di Serial Monitor."); continue; }
    if (time(nullptr)<1735689600) { Serial.println("HTTPS: menunggu sinkronisasi waktu untuk validasi sertifikat"); continue; }
    JsonDocument payload;
    payload["device_id"]=DEVICE_ID; payload["message_id"]=newMessageId();
    payload["location_id"]=LOCATION_ID;
    if (s.sensorOk) { payload["temperature"]=s.temperature; payload["humidity"]=s.humidity; }
    else { payload["temperature"]=nullptr; payload["humidity"]=nullptr; }
    payload["co2"]=s.co2; payload["pm25"]=s.pm25; payload["pcm_temperature"]=s.pcm;
    payload["light_lux"]=s.lux; payload["occupancy"]=s.occupancy;
    payload["sensor_ok"]=s.sensorOk; payload["tank_ok"]=s.tankOk;
    payload["fan_on"]=s.fan; payload["pump_on"]=s.pump; payload["hvac_on"]=s.hvac;
    payload["ventilation_degrees"]=s.angle; payload["setpoint"]=s.setpoint;
    payload["firmware_version"]=FIRMWARE;
    String body; serializeJson(payload,body);
    WiFiClientSecure client;
    client.setCACert(TRUSTED_CA); client.setHandshakeTimeout(20);
    HTTPClient http; http.setConnectTimeout(4000); http.setTimeout(4000);
    if (!http.begin(client,config.url)) { Serial.println("HTTPS: URL gagal"); continue; }
    http.addHeader("Content-Type","application/json");
    http.addHeader("Authorization",String("Bearer ")+config.token);
    const int code=http.POST(body);
    Serial.printf("HTTPS POST: %d\n",code);
    if (code==200) {
      JsonDocument response;
      if (!deserializeJson(response,http.getString()) && response["ok"]==true && response["location_id"]==LOCATION_ID && response["setpoint"].is<float>()) {
        float sp=response["setpoint"];
        if (isfinite(sp) && sp>=18 && sp<=32) {
          portENTER_CRITICAL(&configMux); requestedSetpoint=sp; portEXIT_CRITICAL(&configMux);
        }
      }
    }
    http.end();
  }
}
void readSerialConfig() {
  while (Serial.available()) {
    const char c=Serial.read();
    if (c=='\r') continue;
    if (c=='\n') {
      if (serialLine.startsWith("CONNECT ")) {
        int split=serialLine.indexOf(' ',8);
        String url=serialLine.substring(8,split), token=serialLine.substring(split+1);
        if (split>8 && url.startsWith("https://") && url.length()<220 && token.length()>=32 && token.length()<128 && token.indexOf(' ')==-1) {
          Connection cfg={}; url.toCharArray(cfg.url,sizeof(cfg.url)); token.toCharArray(cfg.token,sizeof(cfg.token));
          xQueueOverwrite(connections,&cfg);
          Serial.println("Koneksi web diterapkan di RAM. Token tidak disimpan pada sketch.");
        } else Serial.println("Format: CONNECT https://alamat/telemetry token");
      }
      serialLine="";
    } else if (serialLine.length()<400) serialLine+=c;
    else serialLine="";
  }
}
void setup() {
  Serial.begin(115200);
  digitalWrite(PUMP_PIN,RELAY_OFF); pinMode(PUMP_PIN,OUTPUT);
  pinMode(FAN_PIN,OUTPUT); if (ROOM_ACTUATORS) pinMode(HVAC_PIN,OUTPUT);
  pinMode(PIR_PIN,INPUT); pinMode(TANK_PIN,INPUT_PULLUP);
  analogReadResolution(12); analogSetAttenuation(ADC_11db);
  gpio_set_direction((gpio_num_t)DHT_PIN,GPIO_MODE_INPUT_OUTPUT_OD);
  gpio_set_pull_mode((gpio_num_t)DHT_PIN,GPIO_PULLUP_ONLY);
  gpio_set_level((gpio_num_t)DHT_PIN,1);
  if (ROOM_ACTUATORS) { vent.setPeriodHertz(50); vent.attach(SERVO_PIN,500,2400); vent.write(0); }
  samples=xQueueCreate(1,sizeof(Sample)); connections=xQueueCreate(1,sizeof(Connection));
  // TLS crypto must share CPU0 with its idle task so the watchdog stays fed.
  // Sensor/control work remains on CPU1 while HTTPS runs at idle priority.
  xTaskCreatePinnedToCore(networkTask,"telemetry",12288,nullptr,0,nullptr,0);
  Serial.printf("CLIMATE SHELTER 3.0 | LOKASI=%s | AUTO ON >26.7C, OFF <=26.2C\n",LOCATION_ID);
  Serial.println("Pompa GPIO22 melalui relay; sakelar GPIO21 ke GND = tandon berisi.");
  Serial.println("Vercel: CONNECT https://domain-anda/api/wokwi/telemetry <key-ESP32-lokasi-ini>");
  Serial.println("Lokal: CONNECT https://alamat-tunnel/telemetry <token-lokal>. Secret hanya di RAM.");
}
void loop() {
  static unsigned long lastRead=0, lastSend=0;
  static Sample s={};
  readSerialConfig();
  portENTER_CRITICAL(&configMux); s.setpoint=requestedSetpoint; portEXIT_CRITICAL(&configMux);
  if (millis()-lastRead>=2500) {
    lastRead=millis();
    TempAndHumidity th=readDht22();
    s.temperature=th.temperature; s.humidity=th.humidity;
    s.sensorOk=isfinite(s.temperature)&&isfinite(s.humidity);
    if (!s.sensorOk) Serial.println("DHT GPIO4: timeout/checksum error; outputs safe OFF");
    s.co2=mapAnalog(CO2_PIN,400,2000); s.pm25=mapAnalog(PM25_PIN,0,150);
    s.pcm=mapAnalog(PCM_PIN,18,45); s.lux=readLux();
  }
  s.tankOk=digitalRead(TANK_PIN)==LOW; s.occupancy=digitalRead(PIR_PIN)==HIGH;
  if (!s.sensorOk) cooling=false;
  else if (s.temperature>s.setpoint) cooling=true;
  else if (s.temperature<=s.setpoint-HYSTERESIS) cooling=false;
  s.fan=cooling; s.pump=cooling&&s.tankOk; s.hvac=ROOM_ACTUATORS&&s.sensorOk&&s.temperature>=31.5f&&s.occupancy;
  s.angle=ROOM_ACTUATORS&&cooling?90:0;
  digitalWrite(FAN_PIN,s.fan); digitalWrite(PUMP_PIN,s.pump?RELAY_ON:RELAY_OFF);
  if (ROOM_ACTUATORS) { digitalWrite(HVAC_PIN,s.hvac); vent.write(s.angle); }
  if (millis()-lastSend>=5000) {
    lastSend=millis();
    Serial.printf("T=%.1fC RH=%.1f%% CO2=%.0f PM25=%.1f PCM=%.1f LUX=%.0f PIR=%d TANK=%d | SP=%.1f FAN=%d PUMP=%d HVAC=%d VENT=%d SENSOR=%s\n",
      s.temperature,s.humidity,s.co2,s.pm25,s.pcm,s.lux,s.occupancy,s.tankOk,s.setpoint,s.fan,s.pump,s.hvac,s.angle,s.sensorOk?"OK":"ERROR");
    xQueueOverwrite(samples,&s);
  }
  delay(20);
}
