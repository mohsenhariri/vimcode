.PHONY: build test compile package vsix clean

build:
	npm run package

test:
	npm test

compile:
	npm run compile

package: build

vsix:
	npm run vsix

clean:
	npm run clean
