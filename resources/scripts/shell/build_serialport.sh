#!/bin/bash
cd node_modules/cncserver/node_modules/serialport
echo "Is your architecture 32 bit(1) or 64 bit(2)?"
read arch
if [ $arch = 1 ] || [ $arch = "ia32" ] ||[ $arch = "32" ]
then
    node-pre-gyp build --runtime=node-webkit --target=0.11.6 --target_arch=ia32
else
    if [ $arch = 2 ] || [ $arch = "x64" ] ||[ $arch = "64" ]
    then
	node-pre-gyp build --runtime=node-webkit --target=0.11.6 --target_arch=x64
    else
	echo "Valid answers are [("1"||"ia32"||"32") || ("2"||"x64"||"64")]"
	exit 127
    fi
fi

echo "cncserver should be built properly."
