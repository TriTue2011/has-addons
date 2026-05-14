FROM ghcr.io/tritue2011/chatgpt2api:latest

EXPOSE 3030

# Use run.sh to map HA config options to env vars
COPY run.sh /run.sh
RUN chmod +x /run.sh
CMD ["/run.sh"]
