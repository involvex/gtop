FROM node:20-alpine

RUN apk --no-cache add procps curl
ENV LANG=en_US.utf8 \
    TERM=xterm-256color

# Install bun
RUN curl -fsSL https://bun.sh/install | bash && \
    ln -s /root/.bun/bin/bun /usr/local/bin/bun

COPY lib lib
COPY bin bin
COPY package.json .

RUN npm install

CMD ["bun", "index.js"]
