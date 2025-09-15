FROM osrm/osrm-backend:latest
# Espera arquivos /data/*.osm.pbf e /data/*.osrm pré-processados fora do container.
CMD ["bash", "-lc", "osrm-routed --algorithm mld /data/your-region.osrm"]
