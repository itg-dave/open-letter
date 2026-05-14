FROM node:20-alpine

# Install Haraka globally
RUN npm install -g Haraka

# Scaffold a fresh Haraka instance into /haraka
RUN haraka --install /haraka

WORKDIR /haraka

# Overlay our config on top of the scaffold defaults
COPY config/ /haraka/config/

# Copy custom plugins
COPY plugins/ /haraka/plugins/

EXPOSE 25 587

CMD ["haraka", "-c", "/haraka"]
