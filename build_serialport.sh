#!/bin/bash
cd node_modules/cncserver/node_modules/serialport
echo "Is your archatecture ia32(1) or x64(2)?"
read arch
if [ $arch = 1 ] || [ $arch = "ia32" ]
then
    node-pre-gyp build --runtime=node-webkit --target=0.10.5 --target_arch=ia32
    mv build/serialport/v1.4.6/Release/node-webkit-v0.10.5-darwin-ia32/ build/serialport/v1.4.6/Release/node-webkit-v14-darwin-ia32/
else
    if [ $arch = 2 ] || [ $arch = "x64" ]
    then
	node-pre-gyp build --runtime=node-webkit --target=0.10.5 --target_arch=x64
	mv build/serialport/v1.4.6/Release/node-webkit-v0.10.5-darwin-x64/ build/serialport/v1.4.6/Release/node-webkit-v14-darwin-x64/
    else
	echo "Valid answers are [("1"||"ia32") || ("2"||"x64")]"
	exit 127
    fi
fi

echo "cncserver should be built properly."
