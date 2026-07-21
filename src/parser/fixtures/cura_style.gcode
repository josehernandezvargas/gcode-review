;FLAVOR:Marlin
;TIME:42
;Filament used: 0.032m
;Layer height: 0.2
;Generated with Cura_SteamEngine 5.6.0
M82 ;absolute extrusion mode
G21 ;metric values
G90 ;absolute positioning
M140 S60 ;set bed temp
M104 S200 ;set nozzle temp
G28 ;home all axes
;LAYER_COUNT:2
;LAYER:0
G1 Z0.2 F1200
G1 X0 Y0 F3000
;TYPE:WALL-OUTER
G1 X10 Y0 E0.4 F1200
G1 X10 Y10 E0.8
G1 X0 Y10 E1.2
G1 X0 Y0 E1.6
;LAYER:1
G1 Z0.4 F1200
G1 X0 Y0 F3000
G1 X10 Y0 E2.0 F1200
G1 X10 Y10 E2.4
G1 X0 Y10 E2.8
G1 X0 Y0 E3.2
M107
