FROM node:22-alpine
WORKDIR /srv/proxy
COPY --chown=node:node server/provider-egress-proxy.mjs ./proxy.mjs
COPY --chown=node:node server/provider-tls-client-hello.mjs ./provider-tls-client-hello.mjs
USER node
EXPOSE 3128
CMD ["node", "proxy.mjs"]
